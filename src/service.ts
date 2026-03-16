import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { TranslationCache } from './cache.js';
import { loadConfig } from './config.js';
import { collectFiles, copyAsset, isMarkdownFile, writeTextFile } from './fs-utils.js';
import { Logger } from './logger.js';
import { translateMarkdown } from './markdown.js';
import { createTranslator } from './translator/index.js';
import type { RunSummary, TranslationFailure, TranslationOutcome } from './types.js';
import { openInTypora } from './typora.js';

export interface RunOptions {
  pathArg: string;
  cwd: string;
  configPath: string | undefined;
  outputOverride: string | undefined;
  openAfterTranslate: boolean | undefined;
  forceRetranslate: boolean | undefined;
}

function buildCacheNamespace(config: Awaited<ReturnType<typeof loadConfig>>['config']): string {
  const translatorIdentity =
    config.translator.provider === 'volcengine-translate'
      ? {
          provider: config.translator.provider,
          endpoint: config.translator.endpoint,
          region: config.translator.region,
          action: config.translator.action,
          version: config.translator.version,
          glossaryId: config.translator.glossaryId,
          projectId: config.translator.projectId,
          systemPrompt: config.translator.systemPrompt,
        }
      : {
          provider: config.translator.provider,
          baseUrl: config.translator.baseUrl,
          model: config.translator.model,
          extraHeaders: config.translator.extraHeaders,
          systemPrompt: config.translator.systemPrompt,
        };

  return JSON.stringify({
    ...translatorIdentity,
    sourceLang: config.sourceLang,
    targetLang: config.targetLang,
  });
}

function siblingOutputPath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}.zh${parsed.ext}`);
}

function mirrorOutputPath(root: string, outputRoot: string, sourcePath: string): string {
  const relative = path.relative(root, sourcePath);
  return path.join(outputRoot, relative);
}

export async function runTranslation(options: RunOptions, logger = new Logger()): Promise<RunSummary> {
  const rootPath = path.resolve(options.cwd, options.pathArg);
  const { config, glossary } = await loadConfig(options.cwd, options.configPath);
  const translator = createTranslator(config);
  const cachePath = path.join(options.cwd, '.mdtrans-cache', 'translations.sqlite');
  const cache = new TranslationCache(cachePath);
  const cacheNamespace = buildCacheNamespace(config);

  try {
    const rootStats = await stat(rootPath);
    const outputs: TranslationOutcome[] = [];
    const failures: TranslationFailure[] = [];
    const warnings: string[] = [];

    if (config.translator.provider === 'mock') {
      const warning = '当前使用的是 mock 翻译器，只用于验证链路，输出不会是真实中文译文。';
      logger.warn(warning);
      warnings.push(warning);
    }

    if (rootStats.isFile()) {
      const outputPath = options.outputOverride
        ? path.resolve(options.cwd, options.outputOverride)
        : siblingOutputPath(rootPath);
      const outcome = await translateOneFile(
        rootPath,
        outputPath,
        {
          translator,
          cache,
          glossary,
          sourceLang: config.sourceLang,
          targetLang: config.targetLang,
          timeoutMs: config.translator.timeoutMs,
          systemPrompt: config.translator.systemPrompt,
          cacheNamespace,
          forceRetranslate: options.forceRetranslate ?? false,
        },
      );
      outputs.push(outcome);
      logger.info(`已输出 ${outputPath}`);
      if (options.openAfterTranslate ?? config.openInTypora) {
        openInTypora(outputPath);
      }
      const summary = summarize(
        options.cwd,
        outputs,
        failures,
        config.translator.provider,
        warnings,
        options.forceRetranslate ?? false,
      );
      await writeRunMetadata(options.cwd, summary);
      return summary;
    }

    const outputRoot = options.outputOverride
      ? path.resolve(options.cwd, options.outputOverride)
      : path.join(rootPath, config.outputDir);
    const files = await collectFiles(rootPath, config.ignorePatterns);

    for (const filePath of files) {
      const outputPath = mirrorOutputPath(rootPath, outputRoot, filePath);
      try {
        if (isMarkdownFile(filePath)) {
          const translated = await translateOneFile(
            filePath,
            outputPath,
            {
              translator,
              cache,
              glossary,
              sourceLang: config.sourceLang,
              targetLang: config.targetLang,
              timeoutMs: config.translator.timeoutMs,
              systemPrompt: config.translator.systemPrompt,
              cacheNamespace,
              forceRetranslate: options.forceRetranslate ?? false,
            },
          );
          outputs.push(translated);
          logger.info(`已翻译 ${path.relative(rootPath, filePath)}`);
        } else {
          await copyAsset(filePath, outputPath);
          outputs.push({
            sourcePath: filePath,
            outputPath,
            copied: true,
            translatedSegments: 0,
            cachedSegments: 0,
            skippedSegments: 0,
          });
        }
      } catch (error) {
        const failure: TranslationFailure = {
          sourcePath: filePath,
          stage: isMarkdownFile(filePath) ? 'translate' : 'copy',
          message: error instanceof Error ? error.message : String(error),
        };
        failures.push(failure);
        logger.error(`处理失败 ${path.relative(rootPath, filePath)}: ${failure.message}`);
      }
    }

    if ((options.openAfterTranslate ?? config.openInTypora) && outputs.length > 0) {
      const firstMarkdownOutput = outputs.find((item) => item.outputPath.endsWith('.md') && !item.copied);
      if (firstMarkdownOutput) {
        openInTypora(firstMarkdownOutput.outputPath);
      } else {
        openInTypora(outputRoot);
      }
    }

    const summary = summarize(
      options.cwd,
      outputs,
      failures,
      config.translator.provider,
      warnings,
      options.forceRetranslate ?? false,
    );
    await writeRunMetadata(options.cwd, summary);
    return summary;
  } finally {
    cache.close();
  }
}

async function translateOneFile(
  sourcePath: string,
  outputPath: string,
  translateOptions: Parameters<typeof translateMarkdown>[1],
): Promise<TranslationOutcome> {
  const markdown = await readFile(sourcePath, 'utf8');
  const translated = await translateMarkdown(markdown, translateOptions);
  await writeTextFile(outputPath, translated.output);
  return {
    sourcePath,
    outputPath,
    copied: false,
    ...translated.stats,
  };
}

async function writeRunMetadata(cwd: string, summary: RunSummary): Promise<void> {
  const metadataPath = path.join(cwd, '.mdtrans-cache', 'last-run.json');
  await writeTextFile(metadataPath, JSON.stringify(summary, null, 2));
}

function summarize(
  cwd: string,
  outputs: TranslationOutcome[],
  failures: TranslationFailure[],
  provider: RunSummary['provider'],
  warnings: string[],
  forced: boolean,
): RunSummary {
  const metadataPath = path.join(cwd, '.mdtrans-cache', 'last-run.json');
  return outputs.reduce<RunSummary>(
    (summary, current) => {
      summary.outputs.push(current);
      summary.translatedSegments += current.translatedSegments;
      summary.cachedSegments += current.cachedSegments;
      summary.skippedSegments += current.skippedSegments;
      return summary;
    },
    {
      outputs: [],
      failures,
      provider,
      metadataPath,
      warnings,
      forced,
      translatedSegments: 0,
      cachedSegments: 0,
      skippedSegments: 0,
    },
  );
}
