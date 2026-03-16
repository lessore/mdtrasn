import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visitParents } from 'unist-util-visit-parents';
import { sha256 } from './hash.js';
import { protectText, restoreProtectedText, shouldTranslateText } from './protect.js';
import type { Glossary, TranslationContext, TranslationStats, TranslationUnit, TranslatorAdapter } from './types.js';
import { TranslationCache } from './cache.js';

interface TextNode {
  type: 'text';
  value: string;
}

type ParentNode = { type?: string };

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

export async function translateMarkdown(
  input: string,
  options: MarkdownTranslateOptions,
): Promise<{ output: string; stats: TranslationStats }> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      listItemIndent: 'one',
    });

  const tree = processor.parse(input);
  const candidates: Array<{ node: TextNode; original: string; unit: TranslationUnit }> = [];
  let skippedSegments = 0;
  let cachedSegments = 0;

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

    const { protectedText, restoreMap } = protectText(textNode.value, options.glossary);
    if (!shouldTranslateText(protectedText)) {
      skippedSegments += 1;
      return;
    }

    const cacheKey = sha256(
      JSON.stringify({
        namespace: options.cacheNamespace,
        text: protectedText,
        sourceLang: options.sourceLang,
        targetLang: options.targetLang,
        glossary: options.glossary.translateAs,
      }),
    );

    candidates.push({
      node: textNode,
      original: textNode.value,
      unit: {
        cacheKey,
        originalText: textNode.value,
        protectedText,
        restoreMap,
      },
    });
  });

  const uncachedUnits: TranslationUnit[] = [];
  const pendingNodes = new Map<string, Array<{ node: TextNode; restoreMap: Map<string, string> }>>();
  const scheduledCacheKeys = new Set<string>();

  for (const candidate of candidates) {
    const cached = options.forceRetranslate ? null : options.cache.get(candidate.unit.cacheKey);
    if (cached) {
      candidate.node.value = restoreProtectedText(cached, candidate.unit.restoreMap);
      cachedSegments += 1;
      continue;
    }
    const current = pendingNodes.get(candidate.unit.cacheKey) ?? [];
    current.push({ node: candidate.node, restoreMap: candidate.unit.restoreMap });
    pendingNodes.set(candidate.unit.cacheKey, current);
    if (!scheduledCacheKeys.has(candidate.unit.cacheKey)) {
      uncachedUnits.push(candidate.unit);
      scheduledCacheKeys.add(candidate.unit.cacheKey);
    }
  }

  const translationContext: TranslationContext = {
    sourceLang: options.sourceLang,
    targetLang: options.targetLang,
    glossary: options.glossary,
    timeoutMs: options.timeoutMs,
    systemPrompt: options.systemPrompt,
  };

  if (uncachedUnits.length > 0) {
    const translations = await options.translator.translateUnits(uncachedUnits, translationContext);
    for (const unit of uncachedUnits) {
      const translated = translations.get(unit.cacheKey);
      if (!translated) {
        throw new Error(`Missing translation for cache key ${unit.cacheKey}.`);
      }
      options.cache.set(unit.cacheKey, translated);
      const pending = pendingNodes.get(unit.cacheKey) ?? [];
      for (const item of pending) {
        item.node.value = restoreProtectedText(translated, item.restoreMap);
      }
    }
  }

  const output = processor.stringify(tree);
  return {
    output,
    stats: {
      translatedSegments: uncachedUnits.length,
      cachedSegments,
      skippedSegments,
    },
  };
}
