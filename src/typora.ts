import { spawn } from 'node:child_process';

export function openInTypora(targetPath: string): void {
  try {
    const processRef = spawn('open', ['-a', 'Typora', targetPath], {
      detached: true,
      stdio: 'ignore',
    });
    processRef.unref();
  } catch {
    const processRef = spawn('open', [targetPath], {
      detached: true,
      stdio: 'ignore',
    });
    processRef.unref();
  }
}

export function openInDefaultApp(targetPath: string): void {
  const processRef = spawn('open', [targetPath], {
    detached: true,
    stdio: 'ignore',
  });
  processRef.unref();
}
