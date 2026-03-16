import type {
  OpenAICompatibleTranslatorConfig,
  TranslationContext,
  TranslationUnit,
  TranslatorAdapter,
} from '../types.js';
import { withRetries } from '../retry.js';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface BatchTranslationPayload {
  translations: Array<{
    id: string;
    text: string;
  }>;
}

function extractMessageContent(response: ChatCompletionResponse): string {
  const message = response.choices?.[0]?.message?.content;
  if (typeof message === 'string') {
    return message.trim();
  }
  if (Array.isArray(message)) {
    return message
      .map((item) => item.text ?? '')
      .join('')
      .trim();
  }
  throw new Error(response.error?.message ?? 'Translation API returned an empty response.');
}

async function mapConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const safeLimit = Math.max(1, limit);
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        return;
      }
      const currentItem = items[currentIndex];
      if (currentItem === undefined) {
        return;
      }
      results[currentIndex] = await worker(currentItem);
    }
  });

  await Promise.all(runners);
  return results;
}

function chunkUnits(units: TranslationUnit[], maxItems = 12, maxChars = 6000): TranslationUnit[][] {
  const batches: TranslationUnit[][] = [];
  let current: TranslationUnit[] = [];
  let currentChars = 0;

  for (const unit of units) {
    const nextChars = currentChars + unit.protectedText.length;
    const shouldFlush = current.length >= maxItems || nextChars > maxChars;
    if (current.length > 0 && shouldFlush) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(unit);
    currentChars += unit.protectedText.length;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function extractJsonPayload(raw: string): BatchTranslationPayload {
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match?.[0] ?? raw;
  const parsed = JSON.parse(jsonText) as Partial<BatchTranslationPayload>;
  if (!parsed.translations || !Array.isArray(parsed.translations)) {
    throw new Error('Translation model did not return a valid JSON translations array.');
  }
  return {
    translations: parsed.translations
      .filter(
        (item): item is { id: string; text: string } =>
          typeof item?.id === 'string' && typeof item?.text === 'string',
      ),
  };
}

export class OpenAICompatibleTranslator implements TranslatorAdapter {
  readonly name = 'openai-compatible';

  constructor(private readonly config: OpenAICompatibleTranslatorConfig) {}

  async translateUnits(
    units: TranslationUnit[],
    context: TranslationContext,
  ): Promise<Map<string, string>> {
    const apiKey = process.env[this.config.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `Missing API key. Export ${this.config.apiKeyEnv} before running mdtrans.`,
      );
    }

    const batches = chunkUnits(units);
    const translatedPairs = await mapConcurrent(batches, this.config.concurrency, async (batch) => {
      return this.translateBatchWithFallback(batch, context, apiKey);
    });

    return new Map<string, string>(translatedPairs.flat());
  }

  private async translateBatchWithFallback(
    units: TranslationUnit[],
    context: TranslationContext,
    apiKey: string,
  ): Promise<Array<readonly [string, string]>> {
    try {
      return await this.translateBatch(units, context, apiKey);
    } catch (error) {
      if (units.length === 1) {
        const singleUnit = units[0];
        if (!singleUnit) {
          throw error;
        }
        const translated = await this.translateSingle(singleUnit, context, apiKey);
        return [[singleUnit.cacheKey, translated] as const];
      }

      const midpoint = Math.ceil(units.length / 2);
      const left = units.slice(0, midpoint);
      const right = units.slice(midpoint);
      const leftResult = await this.translateBatchWithFallback(left, context, apiKey);
      const rightResult = await this.translateBatchWithFallback(right, context, apiKey);
      return [...leftResult, ...rightResult];
    }
  }

  private async translateBatch(
    units: TranslationUnit[],
    context: TranslationContext,
    apiKey: string,
  ): Promise<Array<readonly [string, string]>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      const glossaryText = Object.keys(context.glossary.translateAs).length > 0
        ? `Use these fixed translations when relevant: ${JSON.stringify(context.glossary.translateAs)}.`
        : 'No special glossary mappings are provided.';
      const systemPrompt = context.systemPrompt ?? [
        `You translate Markdown prose from ${context.sourceLang} to ${context.targetLang}.`,
        'Return only the translated text, with no commentary and no code fences.',
        'Never translate placeholders like @@mdtrans_keep_0@@.',
        'Preserve punctuation, numbering, whitespace intent, and list semantics.',
        'Keep commands, file paths, environment variables, and API names unchanged.',
        'When translating multiple segments, preserve one-to-one mapping.',
        'Do not invent content.',
        glossaryText,
      ].join(' ');

      const userPayload = {
        translations: units.map((unit, index) => ({
          id: String(index),
          text: unit.protectedText,
        })),
      };

      const response = await withRetries(async () => fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.config.extraHeaders,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${systemPrompt} Return valid JSON only in the shape {"translations":[{"id":"0","text":"..."}]}.`,
            },
            {
              role: 'user',
              content: JSON.stringify(userPayload),
            },
          ],
        }),
        signal: controller.signal,
      }), this.config.retries);

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Translation API failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const rawContent = extractMessageContent(payload);
      const jsonPayload = extractJsonPayload(rawContent);
      const translationMap = new Map(jsonPayload.translations.map((item) => [item.id, item.text]));

      return units.map((unit, index) => {
        const translatedText = translationMap.get(String(index));
        if (!translatedText) {
          throw new Error(`Translation model omitted segment ${index}.`);
        }
        return [unit.cacheKey, translatedText] as const;
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async translateSingle(
    unit: TranslationUnit,
    context: TranslationContext,
    apiKey: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      const glossaryText = Object.keys(context.glossary.translateAs).length > 0
        ? `Use these fixed translations when relevant: ${JSON.stringify(context.glossary.translateAs)}.`
        : 'No special glossary mappings are provided.';
      const systemPrompt = context.systemPrompt ?? [
        `You translate Markdown prose from ${context.sourceLang} to ${context.targetLang}.`,
        'Return only the translated text, with no commentary and no code fences.',
        'Never translate placeholders like @@mdtrans_keep_0@@.',
        'Preserve punctuation, numbering, whitespace intent, and list semantics.',
        'Keep commands, file paths, environment variables, and API names unchanged.',
        'Do not invent content.',
        glossaryText,
      ].join(' ');

      const response = await withRetries(async () => fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.config.extraHeaders,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: unit.protectedText,
            },
          ],
        }),
        signal: controller.signal,
      }), this.config.retries);

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Translation API failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      return extractMessageContent(payload);
    } finally {
      clearTimeout(timeout);
    }
  }
}
