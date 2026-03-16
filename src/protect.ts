import type { Glossary } from './types.js';

const PROTECTED_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s)]+/g,
  /(?:\.\.?\/|\/)[A-Za-z0-9._/@-]+(?:\/[A-Za-z0-9._@-]+)*/g,
  /\b[a-zA-Z0-9_.-]+\.(?:md|mdx|json|yaml|yml|ts|tsx|js|jsx|sh|zsh|toml)\b/g,
  /--[a-zA-Z0-9-]+/g,
  /\$[A-Z_][A-Z0-9_]*/g,
  /\b[A-Z_][A-Z0-9_]{2,}\b/g,
  /\b[A-Za-z]+(?:\.[A-Za-z0-9_-]+){1,}\b/g,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ProtectedTextResult {
  protectedText: string;
  restoreMap: Map<string, string>;
}

export function protectText(input: string, glossary: Glossary): ProtectedTextResult {
  let nextIndex = 0;
  let protectedText = input;
  const restoreMap = new Map<string, string>();

  const replaceWithPlaceholder = (value: string): string => {
    const placeholder = `@@mdtrans_keep_${nextIndex}@@`;
    nextIndex += 1;
    restoreMap.set(placeholder, value);
    return placeholder;
  };

  for (const pattern of PROTECTED_PATTERNS) {
    protectedText = protectedText.replace(pattern, replaceWithPlaceholder);
  }

  for (const term of glossary.preserve) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
    protectedText = protectedText.replace(pattern, replaceWithPlaceholder);
  }

  return { protectedText, restoreMap };
}

export function restoreProtectedText(input: string, restoreMap: Map<string, string>): string {
  let output = input;
  for (const [placeholder, original] of restoreMap.entries()) {
    const placeholderPattern = new RegExp(escapeRegExp(placeholder), 'g');
    output = output.replace(placeholderPattern, original);
  }
  return output;
}

export function shouldTranslateText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    return false;
  }
  if (/^[_\W\d]+$/.test(trimmed)) {
    return false;
  }
  if (/^@@mdtrans_keep_\d+@@$/.test(trimmed)) {
    return false;
  }
  return true;
}
