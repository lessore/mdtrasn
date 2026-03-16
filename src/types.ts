export interface BaseTranslatorConfig {
  provider: 'openai-compatible' | 'mock' | 'volcengine-translate';
  timeoutMs: number;
  concurrency: number;
  retries: number;
}

export interface OpenAICompatibleTranslatorConfig extends BaseTranslatorConfig {
  provider: 'openai-compatible';
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  systemPrompt: string | undefined;
  extraHeaders: Record<string, string>;
}

export interface MockTranslatorConfig extends BaseTranslatorConfig {
  provider: 'mock';
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  systemPrompt: string | undefined;
  extraHeaders: Record<string, string>;
}

export interface VolcengineTranslatorConfig extends BaseTranslatorConfig {
  provider: 'volcengine-translate';
  endpoint: string;
  accessKeyIdEnv: string;
  secretAccessKeyEnv: string;
  region: string;
  service: string;
  action: string;
  version: string;
  glossaryId: string | undefined;
  projectId: string | undefined;
  systemPrompt: string | undefined;
}

export type TranslatorConfig =
  | OpenAICompatibleTranslatorConfig
  | MockTranslatorConfig
  | VolcengineTranslatorConfig;

export interface MdTransConfig {
  sourceLang: string;
  targetLang: string;
  outputMode: 'sibling' | 'mirror-dir';
  outputDir: string;
  translator: TranslatorConfig;
  glossary: string;
  ignorePatterns: string[];
  openInTypora: boolean;
  uiPort: number;
}

export interface Glossary {
  preserve: string[];
  translateAs: Record<string, string>;
}

export interface TranslationContext {
  sourceLang: string;
  targetLang: string;
  glossary: Glossary;
  timeoutMs: number;
  systemPrompt: string | undefined;
  abortSignal?: AbortSignal;
}

export interface TranslationUnit {
  cacheKey: string;
  originalText: string;
  protectedText: string;
  restoreMap: Map<string, string>;
}

export interface TranslatorAdapter {
  readonly name: string;
  translateUnits(
    units: TranslationUnit[],
    context: TranslationContext,
  ): Promise<Map<string, string>>;
}

export interface TranslationStats {
  translatedSegments: number;
  cachedSegments: number;
  skippedSegments: number;
}

export interface TranslationFailure {
  sourcePath: string;
  stage: 'read' | 'translate' | 'write' | 'copy';
  message: string;
}

export interface TranslationOutcome extends TranslationStats {
  sourcePath: string;
  outputPath: string;
  copied: boolean;
}

export interface RunSummary extends TranslationStats {
  outputs: TranslationOutcome[];
  failures: TranslationFailure[];
  provider: TranslatorConfig['provider'];
  metadataPath: string;
  warnings: string[];
  forced: boolean;
}
