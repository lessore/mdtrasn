#!/usr/bin/env node
import path from 'node:path';
import { Logger } from './logger.js';
import { runTranslation } from './service.js';
import { openInTypora } from './typora.js';
import { startUiServer } from './ui.js';
import { watchAndTranslate } from './watch.js';

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  let command: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) {
      continue;
    }
    if (!command && !current.startsWith('--')) {
      command = current;
      continue;
    }
    if (current.startsWith('--')) {
      const key = current.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
      continue;
    }
    positionals.push(current);
  }

  return { command, positionals, options };
}

function printHelp(): void {
  console.log(`mdtrans

用法:
  mdtrans translate <path> [--config <file>] [--output <dir>] [--open] [--force]
  mdtrans watch <path> [--config <file>] [--output <dir>] [--open] [--force]
  mdtrans open <path>
  mdtrans ui [--config <file>] [--port <number>]
`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const logger = new Logger();
  const cwd = process.cwd();

  if (!parsed.command || parsed.command === '--help' || parsed.command === 'help') {
    printHelp();
    return;
  }

  if (parsed.command === 'translate') {
    const target = parsed.positionals[0];
    if (!target) {
      throw new Error('translate 命令需要一个文件或目录路径。');
    }
    const summary = await runTranslation(
      {
        pathArg: target,
        cwd,
        configPath: typeof parsed.options.config === 'string' ? parsed.options.config : undefined,
        outputOverride: typeof parsed.options.output === 'string' ? parsed.options.output : undefined,
        openAfterTranslate: parsed.options.open ? true : undefined,
        forceRetranslate: parsed.options.force ? true : undefined,
      },
      logger,
    );
    logger.info(
      `完成：${summary.outputs.length} 个输出，新增翻译 ${summary.translatedSegments} 段，命中缓存 ${summary.cachedSegments} 段，跳过 ${summary.skippedSegments} 段。`,
    );
    if (summary.failures.length > 0) {
      logger.warn(`有 ${summary.failures.length} 个文件处理失败，详情见 ${summary.metadataPath}`);
    } else {
      logger.info(`运行元数据已写入 ${summary.metadataPath}`);
    }
    return;
  }

  if (parsed.command === 'watch') {
    const target = parsed.positionals[0];
    if (!target) {
      throw new Error('watch 命令需要一个文件或目录路径。');
    }
    await watchAndTranslate({
      pathArg: target,
      cwd,
      configPath: typeof parsed.options.config === 'string' ? parsed.options.config : undefined,
      outputOverride: typeof parsed.options.output === 'string' ? parsed.options.output : undefined,
      openAfterTranslate: parsed.options.open ? true : undefined,
      forceRetranslate: parsed.options.force ? true : undefined,
    });
    return;
  }

  if (parsed.command === 'open') {
    const target = parsed.positionals[0];
    if (!target) {
      throw new Error('open 命令需要一个路径。');
    }
    openInTypora(path.resolve(cwd, target));
    logger.info('已尝试在 Typora 中打开目标。');
    return;
  }

  if (parsed.command === 'ui') {
    await startUiServer(
      cwd,
      typeof parsed.options.config === 'string' ? parsed.options.config : undefined,
      typeof parsed.options.port === 'string' ? Number(parsed.options.port) : undefined,
    );
    return;
  }

  printHelp();
}

main().catch((error) => {
  console.error(`[mdtrans] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
