import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export function isMarkdownFile(filePath: string): boolean {
  return /\.md$/i.test(filePath);
}

function globPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => globPatternToRegExp(pattern).test(relativePath));
}

export async function collectFiles(root: string, ignorePatterns: string[]): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }

  const rootStat = await stat(root);
  if (rootStat.isFile()) {
    return [root];
  }

  await walk(root);
  return results;
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, content, 'utf8');
}

export async function copyAsset(sourcePath: string, outputPath: string): Promise<void> {
  await ensureParentDir(outputPath);
  await copyFile(sourcePath, outputPath);
}
