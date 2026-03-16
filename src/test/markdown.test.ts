import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { TranslationCache } from '../cache.js';
import { translateMarkdown } from '../markdown.js';
import type { TranslationContext, TranslationUnit, TranslatorAdapter } from '../types.js';

class MockTranslator implements TranslatorAdapter {
  readonly name = 'mock';
  calls = 0;

  async translateUnits(
    units: TranslationUnit[],
    _context: TranslationContext,
  ): Promise<Map<string, string>> {
    this.calls += units.length;
    return new Map(
      units.map((unit) => [
        unit.cacheKey,
        unit.protectedText
          .replace('Planning', '规划')
          .replace('Hello world', '你好，世界')
          .replace('Link title', '链接标题'),
      ]),
    );
  }
}

test('translateMarkdown preserves code blocks, frontmatter and urls', async () => {
  const cacheDir = path.join(os.tmpdir(), `mdtrans-test-${Date.now()}`);
  const cache = new TranslationCache(path.join(cacheDir, 'translations.sqlite'));
  const translator = new MockTranslator();

  try {
    const input = `---
title: Sample Doc
---

# Planning workflow

Hello world with https://example.com and /tmp/sample.md.

\`npm run build\`

> Link title

\`\`\`ts
const message = "Hello world";
\`\`\`
`;

    const result = await translateMarkdown(input, {
      translator,
      cache,
      glossary: {
        preserve: ['workflow'],
        translateAs: {},
      },
      sourceLang: 'English',
      targetLang: 'Simplified Chinese',
      timeoutMs: 1_000,
      systemPrompt: undefined,
      cacheNamespace: 'mock:test:prompt',
      forceRetranslate: false,
    });

    assert.match(result.output, /title: Sample Doc/);
    assert.match(result.output, /# 规划 workflow/);
    assert.match(result.output, /你好，世界 with <?https:\/\/example\.com>? and \/tmp\/sample\.md\./);
    assert.match(result.output, /`npm run build`/);
    assert.match(result.output, /> 链接标题/);
    assert.match(result.output, /const message = "Hello world";/);
    assert.equal(result.stats.translatedSegments > 0, true);
  } finally {
    cache.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('translateMarkdown uses cache for repeated text', async () => {
  const cacheDir = path.join(os.tmpdir(), `mdtrans-test-${Date.now()}-cache`);
  const cache = new TranslationCache(path.join(cacheDir, 'translations.sqlite'));
  const translator = new MockTranslator();

  try {
    const input = `Hello world\n\nHello world\n`;
    await translateMarkdown(input, {
      translator,
      cache,
      glossary: {
        preserve: [],
        translateAs: {},
      },
      sourceLang: 'English',
      targetLang: 'Simplified Chinese',
      timeoutMs: 1_000,
      systemPrompt: undefined,
      cacheNamespace: 'mock:test:prompt',
      forceRetranslate: false,
    });

    await translateMarkdown(input, {
      translator,
      cache,
      glossary: {
        preserve: [],
        translateAs: {},
      },
      sourceLang: 'English',
      targetLang: 'Simplified Chinese',
      timeoutMs: 1_000,
      systemPrompt: undefined,
      cacheNamespace: 'mock:test:prompt',
      forceRetranslate: false,
    });

    assert.equal(translator.calls, 1);
  } finally {
    cache.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
