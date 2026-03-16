import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultConfig } from './defaults.js';
import { loadLocalEnvFiles } from './env.js';
import type { Glossary, MdTransConfig, TranslatorConfig } from './types.js';

export interface LoadedConfig {
  config: MdTransConfig;
  glossary: Glossary;
  configPath: string | undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTranslatorConfig(base: TranslatorConfig, incoming?: Partial<TranslatorConfig>): TranslatorConfig {
  if (!incoming) {
    return base;
  }

  if (incoming.provider && incoming.provider !== base.provider) {
    if (incoming.provider === 'volcengine-translate') {
      return {
        provider: 'volcengine-translate',
        endpoint: 'https://open.volcengineapi.com',
        accessKeyIdEnv: 'VOLCENGINE_ACCESS_KEY_ID',
        secretAccessKeyEnv: 'VOLCENGINE_SECRET_ACCESS_KEY',
        region: 'cn-north-1',
        service: 'translate',
        action: 'TranslateText',
        version: '2020-06-01',
        glossaryId: undefined,
        projectId: undefined,
        timeoutMs: 60_000,
        concurrency: 3,
        retries: 2,
        systemPrompt: undefined,
        ...incoming,
      };
    }

    if (incoming.provider === 'mock') {
      return {
        provider: 'mock',
        baseUrl: 'https://api.openai.com/v1',
        model: 'mock',
        apiKeyEnv: 'MDTRANS_API_KEY',
        timeoutMs: 60_000,
        concurrency: 1,
        retries: 0,
        extraHeaders: {},
        systemPrompt: undefined,
        ...incoming,
      };
    }
  }

  return {
    ...base,
    ...incoming,
  } as TranslatorConfig;
}

function mergeConfig(base: MdTransConfig, incoming: Partial<MdTransConfig>): MdTransConfig {
  return {
    ...base,
    ...incoming,
    translator: mergeTranslatorConfig(base.translator, incoming.translator),
    ignorePatterns: incoming.ignorePatterns ?? base.ignorePatterns,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig> {
  await loadLocalEnvFiles(cwd);
  const configPath = explicitPath ? path.resolve(cwd, explicitPath) : path.join(cwd, 'mdtrans.config.json');

  let config = defaultConfig;
  let resolvedConfigPath: string | undefined;
  try {
    const parsed = await readJsonFile<Partial<MdTransConfig>>(configPath);
    config = mergeConfig(defaultConfig, parsed);
    resolvedConfigPath = configPath;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }

  const glossaryPath = path.resolve(cwd, config.glossary);
  let glossary: Glossary = { preserve: [], translateAs: {} };
  try {
    const parsed = await readJsonFile<unknown>(glossaryPath);
    if (!isObject(parsed)) {
      throw new Error(`Glossary at ${glossaryPath} must be a JSON object.`);
    }
    const preserve = Array.isArray(parsed.preserve)
      ? parsed.preserve.filter((value): value is string => typeof value === 'string')
      : [];
    const translateAs =
      isObject(parsed.translateAs)
        ? Object.fromEntries(
            Object.entries(parsed.translateAs).filter(
              (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
            ),
          )
        : {};
    glossary = { preserve, translateAs };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }

  return { config, glossary, configPath: resolvedConfigPath };
}
