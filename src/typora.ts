import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const TYPORA_BINARY_CANDIDATES = [
  '/Applications/Typora.app/Contents/MacOS/Typora',
  `${process.env.HOME ?? ''}/Applications/Typora.app/Contents/MacOS/Typora`,
].filter(Boolean);

function spawnDetached(command: string, args: string[]): void {
  const processRef = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  processRef.unref();
}

function isDirectory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

export function openInTypora(targetPath: string): void {
  if (isDirectory(targetPath)) {
    openInDefaultApp(targetPath);
    return;
  }

  for (const binaryPath of TYPORA_BINARY_CANDIDATES) {
    if (existsSync(binaryPath)) {
      spawnDetached(binaryPath, [targetPath]);
      return;
    }
  }

  try {
    spawnDetached('open', ['-a', 'Typora', '--args', targetPath]);
  } catch {
    spawnDetached('open', [targetPath]);
  }
}

export function openInDefaultApp(targetPath: string): void {
  spawnDetached('open', [targetPath]);
}
