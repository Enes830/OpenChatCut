/**
 * useArabicTextFit.ts
 *
 * React hook that mirrors the binary-search font-fit loop from:
 *   news_image_lib/src/news_image_generator/rendering/layout_engine.py
 *   → LayoutEngine._fit_text_to_box()
 *
 * Given a text, font, and a bounding box, it:
 *  1. Starts at baseFontSize and decreases by 1 until all lines fit inside maxHeight
 *  2. Applies Kashida justification to non-last lines if kashida=true
 *  3. Returns the fitted lines, the final fontSize, and the lineHeight in px
 *
 * The result is memoised — it only recomputes when inputs change.
 */

import { useMemo } from "react";
import {
  splitTextIntoLines,
  computeLineHeight,
  type LineInfo,
} from "../arabicUtils";

export interface ArabicTextFitInput {
  /** Full text content */
  text: string;
  /** CSS font-family (must already be loaded via loadFont) */
  fontFamily: string;
  /** Starting (maximum) font size in px */
  baseFontSize: number;
  /** Minimum font size — will not shrink below this */
  minFontSize: number;
  /** Width of the text box in px */
  availableWidth: number;
  /** Maximum height of the text box in px */
  maxHeight: number;
  /**
   * Line spacing multiplier.
   * Maps to `line_spacing` in news_image_lib style config.
   */
  lineSpacing: number;
  /**
   * When true: lineHeight = (fontBoundingBoxAscent + Descent) × lineSpacing
   * When false: lineHeight = fontSize × lineSpacing
   * Maps to `use_metrics_line_spacing` in news_image_lib.
   */
  useMetricsLineSpacing: boolean;
  /** Whether to apply Kashida justification to non-last lines */
  kashida: boolean;
}

export interface ArabicTextFitResult {
  /** Fitted and optionally kashida-justified lines */
  lines: LineInfo[];
  /** The final font size chosen by the binary search */
  fontSize: number;
  /** Computed line height in px (use as CSS line-height value) */
  lineHeight: number;
}

/**
 * Binary-search font-fit hook. Safe to call in any React component.
 *
 * @example
 * const { lines, fontSize, lineHeight } = useArabicTextFit({
 *   text: "مقتل الشيخ دونالد ترامب",
 *   fontFamily: "GhroobArabic",
 *   baseFontSize: 150,
 *   minFontSize: 50,
 *   availableWidth: 908,
 *   maxHeight: 383,
 *   lineSpacing: 0.9,
 *   useMetricsLineSpacing: true,
 *   kashida: true,
 * });
 */
export function useArabicTextFit(input: ArabicTextFitInput): ArabicTextFitResult {
  const {
    text,
    fontFamily,
    baseFontSize,
    minFontSize,
    availableWidth,
    maxHeight,
    lineSpacing,
    useMetricsLineSpacing,
    kashida,
  } = input;

  return useMemo(() => {
    // Guard: if we have no text or zero box, return empty immediately
    if (!text || availableWidth <= 0 || maxHeight <= 0) {
      return {
        lines: [],
        fontSize: minFontSize,
        lineHeight: computeLineHeight(fontFamily, minFontSize, lineSpacing, useMetricsLineSpacing),
      };
    }

    // Binary-search for the largest fontSize that fits within maxHeight.
    // We search from baseFontSize down to minFontSize in steps of 1.
    // For speed, we use a coarse binary search then refine.
    let lo = minFontSize;
    let hi = baseFontSize;
    let bestFontSize = minFontSize;
    let bestLines: LineInfo[] = [];
    let bestLineHeight = computeLineHeight(fontFamily, minFontSize, lineSpacing, useMetricsLineSpacing);

    // Helper: compute total height for a given font size
    const totalHeight = (fs: number): { height: number; lines: LineInfo[]; lineHeight: number } => {
      const lh = computeLineHeight(fontFamily, fs, lineSpacing, useMetricsLineSpacing);
      const ls = splitTextIntoLines(text, fontFamily, fs, availableWidth, kashida);
      return { height: ls.length * lh, lines: ls, lineHeight: lh };
    };

    // Binary search
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const { height, lines, lineHeight } = totalHeight(mid);
      if (height <= maxHeight) {
        // This size fits — try larger
        bestFontSize = mid;
        bestLines = lines;
        bestLineHeight = lineHeight;
        lo = mid + 1;
      } else {
        // Too big — try smaller
        hi = mid - 1;
      }
    }

    // Edge case: if even minFontSize overflows, still use it
    // (matches Python lib behaviour — it truncates with ellipsis,
    //  but for video we just let it overflow rather than truncate)
    if (bestLines.length === 0) {
      const { lines, lineHeight } = totalHeight(minFontSize);
      bestLines = lines;
      bestLineHeight = lineHeight;
      bestFontSize = minFontSize;
    }

    return { lines: bestLines, fontSize: bestFontSize, lineHeight: bestLineHeight };
  }, [text, fontFamily, baseFontSize, minFontSize, availableWidth, maxHeight, lineSpacing, useMetricsLineSpacing, kashida]);
}
