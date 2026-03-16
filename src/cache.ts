import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class TranslationCache {
  private db: DatabaseSync;

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS translations (
        cache_key TEXT PRIMARY KEY,
        translated_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  get(cacheKey: string): string | null {
    const statement = this.db.prepare('SELECT translated_text FROM translations WHERE cache_key = ?');
    const row = statement.get(cacheKey) as { translated_text?: string } | undefined;
    return row?.translated_text ?? null;
  }

  set(cacheKey: string, translatedText: string): void {
    const statement = this.db.prepare(`
      INSERT INTO translations (cache_key, translated_text)
      VALUES (?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET translated_text = excluded.translated_text
    `);
    statement.run(cacheKey, translatedText);
  }

  clear(): void {
    this.db.exec('DELETE FROM translations');
  }

  close(): void {
    this.db.close();
  }
}
