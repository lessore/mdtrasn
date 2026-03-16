import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { TranslationCache } from '../cache.js';
import { translateMarkdown } from '../markdown.js';
import type { TranslationContext, TranslationUnit, TranslatorAdapter } from '../types.js';

class ForceTranslator implements TranslatorAdapter {
  readonly name = 'force-check';
  calls = 0;

  async translateUnits(
    units: TranslationUnit[],
    _context: TranslationContext,
  ): Promise<Map<string, string>> {
    this.calls += units.length;
    return new Map(units.map((unit) => [unit.cacheKey, `ZH:${unit.protectedText}`]));
  }
}

test('forceRetranslate bypasses cache reads', async () => {
  const cacheDir = path.join(os.tmpdir(), `mdtrans-force-${Date.now()}`);
  const cache = new TranslationCache(path.join(cacheDir, 'translations.sqlite'));
  const translator = new ForceTranslator();

  try {
    const options = {
      translator,
      cache,
      glossary: {
        preserve: [] as string[],
        translateAs: {},
      },
      sourceLang: 'English',
      targetLang: 'Simplified Chinese',
      timeoutMs: 1_000,
      systemPrompt: undefined,
      cacheNamespace: 'force:test',
    };

    await translateMarkdown('Hello world', {
      ...options,
      forceRetranslate: false,
    });
    await translateMarkdown('Hello world', {
      ...options,
      forceRetranslate: true,
    });

    assert.equal(translator.calls, 2);
  } finally {
    cache.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
