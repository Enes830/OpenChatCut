/**
 * arabicUtils.ts
 *
 * TypeScript port of the Kashida justification algorithm from:
 *   news_image_lib/src/news_image_generator/text/text_handler.py
 *
 * Key design decisions:
 * - Uses OffscreenCanvas + ctx.measureText() for glyph width measurement
 *   (browser shaping ≈ Skia shaping, ~95% pixel accuracy)
 * - Kashida (tatweel U+0640) is inserted as plain Unicode — browsers that
 *   render with a proper OpenType Arabic font will handle contextual shaping
 * - Kashida is only applied to non-last lines of a paragraph (standard rule)
 * - Last line of a paragraph aligns right without forced stretching
 *
 * Usage:
 *   import { splitTextIntoLines, kashidaJustifyLine } from './arabicUtils';
 */

// ─── Unicode codepoint sets (mirrors text_handler.py) ────────────────────────

/** Dual-joining Arabic letters — Kashida can be inserted AFTER these */
const CONNECTABLE_LETTERS = new Set([
  0x0626, // ئ Ya with Hamza Above
  0x0628, // ب Baa
  0x062a, // ت Taa
  0x062b, // ث Thaa
  0x062c, // ج Jeem
  0x062d, // ح Haa
  0x062e, // خ Khaa
  0x0633, // س Seen
  0x0634, // ش Sheen
  0x0635, // ص Sad
  0x0636, // ض Dad
  0x0637, // ط Tah
  0x0638, // ظ Zah
  0x0639, // ع Ain
  0x063a, // غ Ghain
  0x0641, // ف Fa
  0x0642, // ق Qaf
  0x0643, // ك Kaf
  0x0644, // ل Lam
  0x0645, // م Meem
  0x0646, // ن Noon
  0x0647, // ه Ha
  0x0649, // ى Alef Maksura
  0x064a, // ي Ya
]);

/** Right-joining only — NEVER insert Kashida after these */
const NON_CONNECTORS = new Set([
  0x0621, // ء Hamza
  0x0622, // آ Alef with Madda
  0x0623, // أ Alef with Hamza Above
  0x0624, // ؤ Waw with Hamza
  0x0625, // إ Alef with Hamza Below
  0x0627, // ا Alef
  0x0629, // ة Taa Marbuta
  0x062f, // د Dal
  0x0630, // ذ Dhal
  0x0631, // ر Ra
  0x0632, // ز Zai
  0x0648, // و Waw
]);

/** Arabic combining diacritics (Tashkeel) — zero-width, skip when finding letter positions */
const DIACRITICS = new Set([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0653,
  0x0654, 0x0655, 0x0656, 0x0670,
]);

/** Alef variants — protect Lam-Alef (لا) ligature */
const ALEF_VARIANTS = new Set([0x0622, 0x0623, 0x0625, 0x0627, 0x0671]);

/** Flat letters that look beautiful when stretched */
const FLAT_LETTERS = new Set([
  0x0628, // ب Baa
  0x062a, // ت Taa
  0x062b, // ث Thaa
  0x0633, // س Seen
  0x0634, // ش Sheen
  0x0641, // ف Fa
  0x0643, // ك Kaf
  0x0644, // ل Lam
]);

const TATWEEL = "\u0640"; // Arabic Tatweel (Kashida)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isArabicLetter(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return CONNECTABLE_LETTERS.has(cp) || NON_CONNECTORS.has(cp);
}

function isDiacritic(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return DIACRITICS.has(cp);
}

function isConnectable(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return CONNECTABLE_LETTERS.has(cp);
}

/** Returns (originalIndex, char) pairs for every base Arabic letter in the word */
function baseLetters(word: string): Array<[number, string]> {
  const result: Array<[number, string]> = [];
  for (let i = 0; i < word.length; i++) {
    if (isArabicLetter(word[i])) result.push([i, word[i]]);
  }
  return result;
}

// ─── Canvas text measurer ─────────────────────────────────────────────────────

let _offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

function getCtx(): OffscreenCanvasRenderingContext2D | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  if (!_offscreenCtx) {
    const canvas = new OffscreenCanvas(1, 1);
    _offscreenCtx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  }
  return _offscreenCtx;
}

/** Measure the rendered pixel width of text at a given font */
export function measureText(text: string, fontFamily: string, fontSize: number): number {
  const ctx = getCtx();
  if (!ctx) {
    // SSR fallback: rough estimate (0.55em per char for Arabic)
    return text.length * fontSize * 0.55;
  }
  ctx.font = `${fontSize}px "${fontFamily}"`;
  return ctx.measureText(text).width;
}

/** Measure a single tatweel character width */
function tatweelWidth(fontFamily: string, fontSize: number): number {
  return measureText(TATWEEL, fontFamily, fontSize);
}

// ─── Kashida candidate analysis ───────────────────────────────────────────────

interface KashidaCandidate {
  fullIndex: number;
  charCode: number;
  wordIndex: number;
  isFirstWord: boolean;
  isLastWord: boolean;
  isBeforeLastLetter: boolean;
  wordLength: number; // base letter count
  currentKashidas: number;
}

function analyzeKashidaCandidates(lineText: string): KashidaCandidate[] {
  const words = lineText.split(" ");
  const candidates: KashidaCandidate[] = [];
  let globalIdx = 0;

  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const word = words[wIdx];
    const wordLen = word.length;
    const base = baseLetters(word);
    const numBase = base.length;

    if (numBase < 2) {
      globalIdx += wordLen + 1;
      continue;
    }

    const lastBaseIdx = base[base.length - 1][0];

    // Build next-base lookup for Lam-Alef protection
    const nextBase = new Map<number, [number, string]>();
    for (let bi = 0; bi < base.length - 1; bi++) {
      nextBase.set(base[bi][0], base[bi + 1]);
    }

    for (let bi = 0; bi < base.length; bi++) {
      const [origIdx, char] = base[bi];

      // Rule 1: Never after last base letter
      if (origIdx === lastBaseIdx) continue;

      // Rule 5: Only dual-joining (connectable) letters
      if (!isConnectable(char)) continue;

      // Rule 3: Lam-Alef ligature protection
      if (char.codePointAt(0) === 0x0644) {
        // Lam
        const nxt = nextBase.get(origIdx);
        if (nxt && ALEF_VARIANTS.has(nxt[1].codePointAt(0) ?? 0)) continue;
      }

      const isBeforeLastLetter = bi === numBase - 2;

      // Skip past any trailing diacritics to find correct insert position
      let insertPos = origIdx + 1;
      while (insertPos < wordLen && isDiacritic(word[insertPos])) {
        insertPos++;
      }
      const fullIndex = globalIdx + insertPos;

      candidates.push({
        fullIndex,
        charCode: char.codePointAt(0) ?? 0,
        wordIndex: wIdx,
        isFirstWord: wIdx === 0,
        isLastWord: wIdx === words.length - 1,
        isBeforeLastLetter,
        wordLength: numBase,
        currentKashidas: 0,
      });
    }

    globalIdx += wordLen + 1; // +1 for the space
  }

  return candidates;
}

// ─── Kashida string reconstruction ───────────────────────────────────────────

function buildKashidaString(
  lineText: string,
  candidates: KashidaCandidate[],
): string {
  const insertionMap = new Map<number, number>();
  for (const c of candidates) {
    if (c.currentKashidas > 0) insertionMap.set(c.fullIndex, c.currentKashidas);
  }

  const chars: string[] = [];
  for (let i = 0; i < lineText.length; i++) {
    chars.push(lineText[i]);
    const count = insertionMap.get(i + 1) ?? 0;
    if (count > 0) chars.push(TATWEEL.repeat(count));
  }
  return chars.join("");
}

// ─── Main Kashida justification ───────────────────────────────────────────────

/**
 * Applies Al-Jazeera-style Kashida justification to a single line.
 * Mirrors ArabicTextHandler.kashida_justify_line() from news_image_lib.
 *
 * @param lineText      Raw Arabic line (no tatweel yet)
 * @param targetWidth   Pixel width to justify to
 * @param fontFamily    CSS font-family name (must be loaded)
 * @param fontSize      Font size in px
 * @param maxKashidasPerWord  Safety cap (default 5)
 */
export function kashidaJustifyLine(
  lineText: string,
  targetWidth: number,
  fontFamily: string,
  fontSize: number,
  maxKashidasPerWord = 5,
): string {
  if (!lineText.trim()) return lineText;

  const currentWidth = measureText(lineText, fontFamily, fontSize);
  if (currentWidth >= targetWidth) return lineText;

  const twWidth = tatweelWidth(fontFamily, fontSize);
  if (twWidth <= 0) return lineText;

  const gap = targetWidth - currentWidth;
  const candidates = analyzeKashidaCandidates(lineText);
  if (candidates.length === 0) return lineText;

  const targetCount = Math.max(1, Math.floor(gap / twWidth));
  let distributedCount = 0;

  // Distribute tatweels using scoring algorithm (mirrors Python)
  while (distributedCount < targetCount) {
    let bestCandidate: KashidaCandidate | null = null;
    let highestScore = -9999;

    for (const cand of candidates) {
      let score = 0;

      // Rule A: Golden position (before last letter)
      if (cand.isBeforeLastLetter) score += 4;

      // Rule B: Line balance (outer words get priority)
      if (cand.isLastWord) score += 3;
      else if (cand.isFirstWord) score += 2;

      // Rule C: Flat letters stretch beautifully
      if (FLAT_LETTERS.has(cand.charCode)) score += 1;

      // Rule D: Prefer long words
      if (cand.wordLength > 4) score += 1;
      else if (cand.wordLength < 3) score -= 2;

      // Rule E: Distribution penalty
      score -= cand.currentKashidas * 6;

      // Rule F: Hard cap
      if (cand.currentKashidas >= maxKashidasPerWord) score = -9999;

      if (score > highestScore) {
        highestScore = score;
        bestCandidate = cand;
      }
    }

    if (!bestCandidate || highestScore === -9999) break;

    bestCandidate.currentKashidas++;
    distributedCount++;
  }

  let result = buildKashidaString(lineText, candidates);

  // Overflow protection: remove excess tatweels if we went over
  let finalWidth = measureText(result, fontFamily, fontSize);
  while (finalWidth > targetWidth && distributedCount > 0) {
    // Find candidate with most tatweels
    let worst: KashidaCandidate | null = null;
    for (const c of candidates) {
      if (c.currentKashidas > 0 && (!worst || c.currentKashidas > worst.currentKashidas)) {
        worst = c;
      }
    }
    if (!worst) break;
    worst.currentKashidas--;
    distributedCount--;
    result = buildKashidaString(lineText, candidates);
    finalWidth = measureText(result, fontFamily, fontSize);
  }

  return result;
}

// ─── Line splitting with kashida justification ────────────────────────────────

export interface LineInfo {
  text: string;
  isJustified: boolean;
}

/**
 * Splits Arabic text into lines that fit `availableWidth`, then applies
 * Kashida justification to non-last lines (mirrors ArabicTextHandler.split_text_into_lines).
 *
 * @param rawText         Full text content (may contain \n for explicit breaks)
 * @param fontFamily      CSS font-family (must be loaded before calling)
 * @param fontSize        Font size in px
 * @param availableWidth  Max line width in px
 * @param kashida         Whether to apply Kashida justification
 */
export function splitTextIntoLines(
  rawText: string,
  fontFamily: string,
  fontSize: number,
  availableWidth: number,
  kashida: boolean,
): LineInfo[] {
  const spaceWidth = measureText(" ", fontFamily, fontSize);
  const paragraphs = rawText.split("\n");
  const result: LineInfo[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push({ text: "", isJustified: false });
      continue;
    }

    const paragraphLines: string[] = [];
    let currentWords: string[] = [];
    let currentWidth = 0;

    for (const word of words) {
      const wordWidth = measureText(word, fontFamily, fontSize);
      const spaceAdd = currentWords.length > 0 ? spaceWidth : 0;

      if (currentWidth + wordWidth + spaceAdd <= availableWidth) {
        currentWords.push(word);
        currentWidth += wordWidth + spaceAdd;
      } else {
        if (currentWords.length > 0) paragraphLines.push(currentWords.join(" "));
        currentWords = [word];
        currentWidth = wordWidth;
      }
    }
    if (currentWords.length > 0) paragraphLines.push(currentWords.join(" "));

    // Justify all lines except the last of each paragraph
    for (let i = 0; i < paragraphLines.length; i++) {
      const isLast = i === paragraphLines.length - 1;
      if (kashida && !isLast) {
        const justified = kashidaJustifyLine(
          paragraphLines[i],
          availableWidth,
          fontFamily,
          fontSize,
        );
        result.push({ text: justified, isJustified: true });
      } else {
        result.push({ text: paragraphLines[i], isJustified: false });
      }
    }
  }

  return result;
}

// ─── Font metrics line-height helper ─────────────────────────────────────────

/**
 * Computes the line height in px for a given font using the same formula
 * as news_image_lib's `_compute_text_line_height`:
 *
 *   use_metrics_line_spacing = true:
 *     lineHeight = (fAscent + fDescent + fLeading) × line_spacing
 *
 *   use_metrics_line_spacing = false:
 *     lineHeight = fontSize × line_spacing
 *
 * Since browsers expose TextMetrics.fontBoundingBoxAscent/Descent (but not
 * fLeading), we approximate:
 *   raw = actualBoundingBoxAscent + actualBoundingBoxDescent (per measured text)
 *   OR fontBoundingBoxAscent + fontBoundingBoxDescent (per font face)
 *
 * The `useMetricsLineSpacing` mode uses font bounding box metrics.
 */
export function computeLineHeight(
  fontFamily: string,
  fontSize: number,
  lineSpacing: number,
  useMetricsLineSpacing: boolean,
): number {
  if (!useMetricsLineSpacing) {
    return fontSize * lineSpacing;
  }

  const ctx = getCtx();
  if (!ctx) return fontSize * lineSpacing;

  ctx.font = `${fontSize}px "${fontFamily}"`;
  // Use a representative Arabic character for metrics
  const m = ctx.measureText("ب");
  // fontBoundingBox covers the full em square (like Skia's fAscent + fDescent)
  const rawHeight =
    (m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent) +
    (m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent);
  return rawHeight * lineSpacing;
}
