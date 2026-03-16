import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { TranslationCache } from '../cache.js';
import { translateMarkdown } from '../markdown.js';
import type { TranslationContext, TranslationUnit, TranslatorAdapter } from '../types.js';

class CountingTranslator implements TranslatorAdapter {
  readonly name = 'counting';
  calls = 0;

  async translateUnits(
    units: TranslationUnit[],
    _context: TranslationContext,
  ): Promise<Map<string, string>> {
    this.calls += units.length;
    return new Map(units.map((unit) => [unit.cacheKey, `ZH:${unit.protectedText}`]));
  }
}

test('cache namespace changes when provider or prompt changes', async () => {
  const cacheDir = path.join(os.tmpdir(), `mdtrans-cache-namespace-${Date.now()}`);
  const cache = new TranslationCache(path.join(cacheDir, 'translations.sqlite'));
  const translator = new CountingTranslator();

  try {
    const baseOptions = {
      translator,
      cache,
      glossary: {
        preserve: [] as string[],
        translateAs: {},
      },
      sourceLang: 'English',
      targetLang: 'Simplified Chinese',
      timeoutMs: 1_000,
      systemPrompt: 'prompt-one',
      forceRetranslate: false,
    };

    await translateMarkdown('Hello world', {
      ...baseOptions,
      cacheNamespace: 'mock:gpt-4o-mini:prompt-one',
    });
    await translateMarkdown('Hello world', {
      ...baseOptions,
      cacheNamespace: 'mock:gpt-4o-mini:prompt-one',
    });
    await translateMarkdown('Hello world', {
      ...baseOptions,
      cacheNamespace: 'openai-compatible:gpt-4o-mini:prompt-two',
      systemPrompt: 'prompt-two',
    });

    assert.equal(translator.calls, 2);
  } finally {
    cache.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
