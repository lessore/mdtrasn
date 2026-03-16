export class Logger {
  info(message: string): void {
    console.log(`[mdtrans] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[mdtrans] ${message}`);
  }

  error(message: string): void {
    console.error(`[mdtrans] ${message}`);
  }
}
