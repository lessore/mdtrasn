import type {
  TranslationContext,
  TranslationUnit,
  TranslatorAdapter,
  VolcengineTranslatorConfig,
} from '../types.js';
import axiosImport, { type AxiosStatic } from 'axios';
import { Signer } from '@volcengine/openapi';
import { withRetries } from '../retry.js';

interface VolcengineTranslationItem {
  Translation?: string;
  DetectedSourceLanguage?: string;
}

interface VolcengineTranslateResponse {
  ResponseMetadata?: {
    Error?: {
      Code?: string | number;
      Message?: string;
    } | null;
  };
  TranslationList?: VolcengineTranslationItem[];
}

const LANGUAGE_CODE_MAP: Record<string, string> = {
  auto: 'auto',
  english: 'en',
  en: 'en',
  chinese: 'zh',
  'simplified chinese': 'zh',
  zh: 'zh',
  'traditional chinese': 'zh-Hant',
  'zh-hant': 'zh-Hant',
  japanese: 'ja',
  ja: 'ja',
  korean: 'ko',
  ko: 'ko',
  french: 'fr',
  fr: 'fr',
  german: 'de',
  de: 'de',
  spanish: 'es',
  es: 'es',
  russian: 'ru',
  ru: 'ru',
};

const axiosClient = (
  (axiosImport as unknown as { default?: AxiosStatic }).default ??
  (axiosImport as unknown as AxiosStatic)
);

function normalizeLanguageCode(language: string, fallback: string): string {
  const normalized = language.trim().toLowerCase();
  return LANGUAGE_CODE_MAP[normalized] ?? fallback;
}

function chunkUnits(units: TranslationUnit[], maxItems = 16, maxChars = 5000): TranslationUnit[][] {
  const batches: TranslationUnit[][] = [];
  let current: TranslationUnit[] = [];
  let currentChars = 0;

  for (const unit of units) {
    const nextChars = currentChars + unit.protectedText.length;
    const wouldOverflow = current.length >= maxItems || nextChars > maxChars;
    if (current.length > 0 && wouldOverflow) {
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

export class VolcengineTranslator implements TranslatorAdapter {
  readonly name = 'volcengine-translate';

  constructor(private readonly config: VolcengineTranslatorConfig) {}

  async translateUnits(
    units: TranslationUnit[],
    context: TranslationContext,
  ): Promise<Map<string, string>> {
    const accessKeyId = process.env[this.config.accessKeyIdEnv];
    const secretAccessKey = process.env[this.config.secretAccessKeyEnv];

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        `Missing Volcengine credentials. Export ${this.config.accessKeyIdEnv} and ${this.config.secretAccessKeyEnv} before running mdtrans.`,
      );
    }

    const endpoint = new URL(this.config.endpoint);
    const sourceLanguage = normalizeLanguageCode(context.sourceLang, 'en');
    const targetLanguage = normalizeLanguageCode(context.targetLang, 'zh');
    const batchedUnits = chunkUnits(units);
    const translations = new Map<string, string>();

    for (const batch of batchedUnits) {
      const payload: Record<string, unknown> = {
        TargetLanguage: targetLanguage,
        TextList: batch.map((unit) => unit.protectedText),
      };

      if (sourceLanguage !== 'auto') {
        payload.SourceLanguage = sourceLanguage;
      }
      if (this.config.glossaryId) {
        payload.GlossaryId = this.config.glossaryId;
      }
      if (this.config.projectId) {
        payload.ProjectId = this.config.projectId;
      }

      const response = await withRetries(
        async () => {
          const request = {
            region: this.config.region,
            method: 'POST',
            pathname: '/',
            params: {
              Action: this.config.action,
              Version: this.config.version,
            },
            headers: {
              Host: endpoint.host,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(payload),
          };

          const signer = new Signer(request, this.config.service);
          signer.addAuthorization({
            accessKeyId,
            secretKey: secretAccessKey,
          });

          const response = await axiosClient.request<VolcengineTranslateResponse>({
            url: `${endpoint.origin}/?Action=${encodeURIComponent(this.config.action)}&Version=${encodeURIComponent(this.config.version)}`,
            method: 'POST',
            headers: request.headers,
            data: request.body,
            proxy: false,
            timeout: context.timeoutMs,
            validateStatus: () => true,
          });

          return response.data;
        },
        this.config.retries,
      );

      const error = response.ResponseMetadata?.Error;
      if (error) {
        throw new Error(`Volcengine translation failed (${error.Code ?? 'unknown'}): ${error.Message ?? 'Unknown error'}`);
      }

      const translationList = response.TranslationList ?? [];
      if (translationList.length !== batch.length) {
        throw new Error(
          `Volcengine returned ${translationList.length} translations for ${batch.length} source segments.`,
        );
      }

      for (let index = 0; index < batch.length; index += 1) {
        const unit = batch[index];
        const translated = translationList[index]?.Translation;
        if (!unit || !translated) {
          throw new Error('Volcengine returned an empty translation item.');
        }
        translations.set(unit.cacheKey, translated);
      }
    }

    return translations;
  }
}
