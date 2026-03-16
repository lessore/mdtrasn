import type { TranslationContext, TranslationUnit, TranslatorAdapter } from '../types.js';

export class MockTranslator implements TranslatorAdapter {
  readonly name = 'mock';

  async translateUnits(
    units: TranslationUnit[],
    _context: TranslationContext,
  ): Promise<Map<string, string>> {
    return new Map(
      units.map((unit) => [
        unit.cacheKey,
        unit.protectedText
          .replace(/\btranslation\b/gi, '翻译')
          .replace(/\bworkflow\b/gi, '工作流')
          .replace(/\bskill\b/gi, '技能')
          .replace(/^/gm, '【机翻】'),
      ]),
    );
  }
}
