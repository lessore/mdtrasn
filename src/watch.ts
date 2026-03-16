import { stat } from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'node:fs';
import { Logger } from './logger.js';
import { runTranslation, type RunOptions } from './service.js';

export async function watchAndTranslate(options: RunOptions, logger = new Logger()): Promise<void> {
  const absolutePath = path.resolve(options.cwd, options.pathArg);
  const rootStats = await stat(absolutePath);
  const watchRoot = rootStats.isDirectory() ? absolutePath : path.dirname(absolutePath);

  await runTranslation(options, logger);
  logger.info(`开始监听 ${watchRoot}`);

  let timer: NodeJS.Timeout | undefined;
  const watcher = watch(watchRoot, { recursive: rootStats.isDirectory() }, (_eventType, changedFileName) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(async () => {
      try {
        if (changedFileName) {
          logger.info(`检测到变更：${changedFileName}`);
        }
        await runTranslation(options, logger);
      } catch (error) {
        logger.error((error as Error).message);
      }
    }, 350);
  });

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      watcher.close();
      resolve();
    });
  });
}
