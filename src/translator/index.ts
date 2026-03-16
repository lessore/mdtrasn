import type { MdTransConfig, TranslatorAdapter } from '../types.js';
import { MockTranslator } from './mock.js';
import { OpenAICompatibleTranslator } from './openai-compatible.js';
import { VolcengineTranslator } from './volcengine.js';

export function createTranslator(config: MdTransConfig): TranslatorAdapter {
  if (config.translator.provider === 'mock') {
    return new MockTranslator();
  }
  if (config.translator.provider === 'volcengine-translate') {
    return new VolcengineTranslator(config.translator);
  }
  return new OpenAICompatibleTranslator(config.translator);
}
