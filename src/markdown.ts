import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visitParents } from 'unist-util-visit-parents';
import { TranslationCache } from './cache.js';
import { sha256 } from './hash.js';
import { protectText, restoreProtectedText, shouldTranslateText } from './protect.js';
import type { Glossary, TranslationContext, TranslationStats, TranslationUnit, TranslatorAdapter } from './types.js';

interface TextNode {
  type: 'text';
  value: string;
}

type ParentNode = { type?: string };

interface TranslationCandidate {
  unit: TranslationUnit;
  applyTranslated: (value: string) => void;
}

interface FrontmatterSplit {
  body: string;
  frontmatter: {
    content: string;
    newline: string;
    closingSuffix: string;
  } | null;
}

interface GlobalProtectionResult {
  protectedInput: string;
  restoreMap: Map<string, string>;
}

export interface MarkdownTranslateOptions {
  translator: TranslatorAdapter;
  cache: TranslationCache;
  glossary: Glossary;
  sourceLang: string;
  targetLang: string;
  timeoutMs: number;
  systemPrompt: string | undefined;
  cacheNamespace: string;
  forceRetranslate: boolean;
}

function shouldSkipNode(parents: ParentNode[]): boolean {
  return parents.some((parent) => parent.type === 'yaml' || parent.type === 'code' || parent.type === 'html');
}

function splitFrontmatter(input: string): FrontmatterSplit {
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) {
    return { body: input, frontmatter: null };
  }

  const fullMatch = match[0];
  const content = match[1] ?? '';
  const closingSuffix = match[2] ?? '';
  const newline = fullMatch.includes('\r\n') ? '\r\n' : '\n';

  return {
    body: input.slice(fullMatch.length),
    frontmatter: {
      content,
      newline,
      closingSuffix,
    },
  };
}

function protectPseudoTags(input: string): GlobalProtectionResult {
  const restoreMap = new Map<string, string>();
  let index = 0;
  const protectedInput = input.replace(/<\/?[_A-Za-z][A-Za-z0-9_-]*>/g, (match) => {
    const placeholder = `MDTRANSTAGTOKEN${index}X`;
    index += 1;
    restoreMap.set(placeholder, match);
    return placeholder;
  });

  return { protectedInput, restoreMap };
}

function restorePseudoTags(input: string, restoreMap: Map<string, string>): string {
  let output = input;
  for (const [placeholder, original] of restoreMap.entries()) {
    output = output.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
  }
  return output;
}

function buildCacheKey(
  options: MarkdownTranslateOptions,
  protectedText: string,
  kind: 'body' | 'frontmatter',
  fieldName?: string,
): string {
  return sha256(
    JSON.stringify({
      namespace: options.cacheNamespace,
      kind,
      fieldName,
      text: protectedText,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      glossary: options.glossary.translateAs,
    }),
  );
}

function createTranslationUnit(
  originalText: string,
  options: MarkdownTranslateOptions,
  kind: 'body' | 'frontmatter',
  fieldName?: string,
): TranslationUnit | null {
  const { protectedText, restoreMap } = protectText(originalText, options.glossary);
  if (!shouldTranslateText(protectedText)) {
    return null;
  }

  return {
    cacheKey: buildCacheKey(options, protectedText, kind, fieldName),
    originalText,
    protectedText,
    restoreMap,
  };
}

function createFrontmatterCandidates(
  content: string,
  options: MarkdownTranslateOptions,
): {
  lines: string[];
  candidates: TranslationCandidate[];
  skippedSegments: number;
} {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const candidates: TranslationCandidate[] = [];
  let skippedSegments = 0;

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+):(\s*)(.*)$/);
    if (!match) {
      skippedSegments += 1;
      continue;
    }

    const [, indent, key, spacing, rawValue] = match;
    const trimmedValue = (rawValue ?? '').trim();
    if (
      !trimmedValue ||
      trimmedValue.startsWith('[') ||
      trimmedValue.startsWith('{') ||
      trimmedValue.startsWith('|') ||
      trimmedValue.startsWith('>') ||
      /^['"]?[a-z0-9_-]+['"]?$/i.test(trimmedValue) && key === 'name'
    ) {
      skippedSegments += 1;
      continue;
    }

    const quote = (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
      ? trimmedValue[0]
      : '';
    const innerValue = quote ? trimmedValue.slice(1, -1) : trimmedValue;

    if (!shouldTranslateText(innerValue)) {
      skippedSegments += 1;
      continue;
    }

    const unit = createTranslationUnit(innerValue, options, 'frontmatter', key);
    if (!unit) {
      skippedSegments += 1;
      continue;
    }

    candidates.push({
      unit,
      applyTranslated: (translated) => {
        const nextValue = quote ? `${quote}${translated}${quote}` : translated;
        lines[index] = `${indent}${key}:${spacing}${nextValue}`;
      },
    });
  }

  return {
    lines,
    candidates,
    skippedSegments,
  };
}

async function applyTranslations(
  candidates: TranslationCandidate[],
  options: MarkdownTranslateOptions,
): Promise<Pick<TranslationStats, 'translatedSegments' | 'cachedSegments'>> {
  const uncachedUnits: TranslationUnit[] = [];
  const pendingNodes = new Map<string, TranslationCandidate[]>();
  const scheduledCacheKeys = new Set<string>();
  let cachedSegments = 0;

  for (const candidate of candidates) {
    const cached = options.forceRetranslate ? null : options.cache.get(candidate.unit.cacheKey);
    if (cached) {
      candidate.applyTranslated(restoreProtectedText(cached, candidate.unit.restoreMap));
      cachedSegments += 1;
      continue;
    }

    const current = pendingNodes.get(candidate.unit.cacheKey) ?? [];
    current.push(candidate);
    pendingNodes.set(candidate.unit.cacheKey, current);

    if (!scheduledCacheKeys.has(candidate.unit.cacheKey)) {
      uncachedUnits.push(candidate.unit);
      scheduledCacheKeys.add(candidate.unit.cacheKey);
    }
  }

  if (uncachedUnits.length === 0) {
    return {
      translatedSegments: 0,
      cachedSegments,
    };
  }

  const translationContext: TranslationContext = {
    sourceLang: options.sourceLang,
    targetLang: options.targetLang,
    glossary: options.glossary,
    timeoutMs: options.timeoutMs,
    systemPrompt: options.systemPrompt,
  };

  const translations = await options.translator.translateUnits(uncachedUnits, translationContext);
  for (const unit of uncachedUnits) {
    const translated = translations.get(unit.cacheKey);
    if (!translated) {
      throw new Error(`Missing translation for cache key ${unit.cacheKey}.`);
    }

    options.cache.set(unit.cacheKey, translated);
    const pending = pendingNodes.get(unit.cacheKey) ?? [];
    for (const candidate of pending) {
      candidate.applyTranslated(restoreProtectedText(translated, unit.restoreMap));
    }
  }

  return {
    translatedSegments: uncachedUnits.length,
    cachedSegments,
  };
}

export async function translateMarkdown(
  input: string,
  options: MarkdownTranslateOptions,
): Promise<{ output: string; stats: TranslationStats }> {
  const globalProtection = protectPseudoTags(input);
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      listItemIndent: 'one',
    });

  const split = splitFrontmatter(globalProtection.protectedInput);
  const frontmatterResult = split.frontmatter
    ? createFrontmatterCandidates(split.frontmatter.content, options)
    : { lines: [] as string[], candidates: [] as TranslationCandidate[], skippedSegments: 0 };

  const tree = processor.parse(split.body);
  const bodyCandidates: TranslationCandidate[] = [];
  let skippedSegments = frontmatterResult.skippedSegments;

  visitParents(tree, 'text', (node, parents) => {
    const textNode = node as TextNode;
    if (shouldSkipNode(parents as ParentNode[])) {
      skippedSegments += 1;
      return;
    }
    if (!shouldTranslateText(textNode.value)) {
      skippedSegments += 1;
      return;
    }

    const unit = createTranslationUnit(textNode.value, options, 'body');
    if (!unit) {
      skippedSegments += 1;
      return;
    }

    bodyCandidates.push({
      unit,
      applyTranslated: (translated) => {
        textNode.value = translated;
      },
    });
  });

  const [frontmatterStats, bodyStats] = await Promise.all([
    applyTranslations(frontmatterResult.candidates, options),
    applyTranslations(bodyCandidates, options),
  ]);

  const bodyOutput = processor.stringify(tree);
  const frontmatterOutput = split.frontmatter
    ? `---${split.frontmatter.newline}${frontmatterResult.lines.join(split.frontmatter.newline)}${split.frontmatter.newline}---${split.frontmatter.closingSuffix}`
    : '';

  return {
    output: restorePseudoTags(`${frontmatterOutput}${bodyOutput}`, globalProtection.restoreMap),
    stats: {
      translatedSegments: frontmatterStats.translatedSegments + bodyStats.translatedSegments,
      cachedSegments: frontmatterStats.cachedSegments + bodyStats.cachedSegments,
      skippedSegments,
    },
  };
}
