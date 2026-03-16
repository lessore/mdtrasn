import type { MdTransConfig } from './types.js';

export const defaultConfig: MdTransConfig = {
  sourceLang: 'English',
  targetLang: 'Simplified Chinese',
  outputMode: 'sibling',
  outputDir: 'translated-zh',
  translator: {
    provider: 'openai-compatible',
    retries: 2,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKeyEnv: 'MDTRANS_API_KEY',
    timeoutMs: 60_000,
    concurrency: 3,
    extraHeaders: {},
    systemPrompt:
      'You are a professional Markdown translator. Translate natural language content into Simplified Chinese. Keep placeholders unchanged. Preserve Markdown structure, numbering, punctuation, code meaning, XML/HTML tag names, file paths, commands, environment variables, and API names. Return only the translated text.',
  },
  glossary: './glossary.json',
  ignorePatterns: [
    '.git/**',
    'node_modules/**',
    'dist/**',
    'translated-zh/**',
  ],
  openInTypora: false,
  uiPort: 4312,
};
