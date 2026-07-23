import type { TokenEstimate, TokenEstimateMethod } from "./types";

// Heuristics from skills/ECC/skills/context-budget/SKILL.md:
//   - Prose: words × 1.3
//   - Code-heavy: chars / 4
const PROSE_WORDS_FACTOR = 1.3;
const CODE_CHARS_PER_TOKEN = 4;
const PROSE_AVG_WORD_CHARS = 5; // average English word ≈ 5 chars

const CODE_INDICATORS = /[{};()=<>[\]!|&+\-*/\\@$:,]/g;
const CODE_RATIO_HIGH = 0.15;
const CODE_RATIO_LOW = 0.05;

/**
 * Estimate token count from content.
 * Auto-detects method (prose / code / mixed) if not specified.
 */
export function estimateTokens(content: string, method?: TokenEstimateMethod): TokenEstimate {
  if (!content || content.length === 0) {
    return { tokens: 0, method: method ?? "mixed" };
  }
  const resolvedMethod = method ?? detectMethod(content);
  const tokens = computeTokens(content, resolvedMethod);
  return { tokens: Math.max(1, Math.ceil(tokens)), method: resolvedMethod };
}

/**
 * Estimate tokens from file size metadata (without reading content).
 * Used during registry before actual file load.
 */
export function estimateTokensFromSize(charCount: number, lineCount: number): TokenEstimate {
  if (charCount === 0) {
    return { tokens: 0, method: "mixed" };
  }
  const avgCharsPerLine = lineCount > 0 ? charCount / lineCount : 0;
  const method: TokenEstimateMethod = avgCharsPerLine > 60 ? "code" : "prose";
  const tokens = method === "code"
    ? charCount / CODE_CHARS_PER_TOKEN
    : (charCount / PROSE_AVG_WORD_CHARS) * PROSE_WORDS_FACTOR;
  return { tokens: Math.max(1, Math.ceil(tokens)), method };
}

function detectMethod(content: string): TokenEstimateMethod {
  const codeChars = (content.match(CODE_INDICATORS) ?? []).length;
  const ratio = content.length > 0 ? codeChars / content.length : 0;
  if (ratio > CODE_RATIO_HIGH) return "code";
  if (ratio < CODE_RATIO_LOW) return "prose";
  return "mixed";
}

function computeTokens(content: string, method: TokenEstimateMethod): number {
  switch (method) {
    case "prose":
      return countWords(content) * PROSE_WORDS_FACTOR;
    case "code":
      return content.length / CODE_CHARS_PER_TOKEN;
    case "mixed": {
      const prose = countWords(content) * PROSE_WORDS_FACTOR;
      const code = content.length / CODE_CHARS_PER_TOKEN;
      return (prose + code) / 2;
    }
  }
}

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}
