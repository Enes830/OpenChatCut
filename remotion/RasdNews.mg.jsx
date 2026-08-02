/**
 * RasdNews.mg.jsx
 * OpenChatCut Editable Motion Graphic Template for "عاجل وسط نص" (Rasd News)
 * 
 * Supports dynamic props editable in OpenChatCut Inspector panel:
 * - photoSrc (image)
 * - sourceText (string)
 * - quote1, quote2, quote3 (text)
 * - fontFamily (font)
 * - textColor (color)
 * - backgroundImageSrc (image)
 */

const CONNECTABLE_LETTERS = new Set([
  0x0626, 0x0628, 0x062a, 0x062b, 0x062c, 0x062d, 0x062e, 0x0633,
  0x0634, 0x0635, 0x0636, 0x0637, 0x0638, 0x0639, 0x063a, 0x0641,
  0x0642, 0x0643, 0x0644, 0x0645, 0x0646, 0x0647, 0x0649, 0x064a,
]);

const NON_CONNECTORS = new Set([
  0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062f,
  0x0630, 0x0631, 0x0632, 0x0648,
]);

const DIACRITICS = new Set([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0653,
  0x0654, 0x0655, 0x0656, 0x0670,
]);

const ALEF_VARIANTS = new Set([0x0622, 0x0623, 0x0625, 0x0627, 0x0671]);

const FLAT_LETTERS = new Set([
  0x0628, 0x062a, 0x062b, 0x0633, 0x0634, 0x0641, 0x0643, 0x0644,
]);

const TATWEEL = "\u0640";

function isArabicLetter(char) {
  const cp = char ? char.codePointAt(0) : 0;
  return CONNECTABLE_LETTERS.has(cp) || NON_CONNECTORS.has(cp);
}

function isDiacritic(char) {
  const cp = char ? char.codePointAt(0) : 0;
  return DIACRITICS.has(cp);
}

function isConnectable(char) {
  const cp = char ? char.codePointAt(0) : 0;
  return CONNECTABLE_LETTERS.has(cp);
}

function baseLetters(word) {
  const result = [];
  for (let i = 0; i < word.length; i++) {
    if (isArabicLetter(word[i])) result.push([i, word[i]]);
  }
  return result;
}

let _offscreenCtx = null;
function getCtx() {
  if (typeof OffscreenCanvas === "undefined") return null;
  if (!_offscreenCtx) {
    const canvas = new OffscreenCanvas(1, 1);
    _offscreenCtx = canvas.getContext("2d");
  }
  return _offscreenCtx;
}

function measureText(text, fontFamily, fontSize) {
  const ctx = getCtx();
  if (!ctx) return text.length * fontSize * 0.55;
  ctx.font = `${fontSize}px "${fontFamily}"`;
  return ctx.measureText(text).width;
}

function tatweelWidth(fontFamily, fontSize) {
  return measureText(TATWEEL, fontFamily, fontSize);
}

function analyzeKashidaCandidates(lineText) {
  const words = lineText.split(" ");
  const candidates = [];
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
    const nextBase = new Map();
    for (let bi = 0; bi < base.length - 1; bi++) {
      nextBase.set(base[bi][0], base[bi + 1]);
    }

    for (let bi = 0; bi < base.length; bi++) {
      const [origIdx, char] = base[bi];
      if (origIdx === lastBaseIdx) continue;
      if (!isConnectable(char)) continue;

      if (char.codePointAt(0) === 0x0644) {
        const nxt = nextBase.get(origIdx);
        if (nxt && ALEF_VARIANTS.has(nxt[1].codePointAt(0) || 0)) continue;
      }

      const isBeforeLastLetter = bi === numBase - 2;
      let insertPos = origIdx + 1;
      while (insertPos < wordLen && isDiacritic(word[insertPos])) {
        insertPos++;
      }
      const fullIndex = globalIdx + insertPos;

      candidates.push({
        fullIndex,
        charCode: char.codePointAt(0) || 0,
        wordIndex: wIdx,
        isFirstWord: wIdx === 0,
        isLastWord: wIdx === words.length - 1,
        isBeforeLastLetter,
        wordLength: numBase,
        currentKashidas: 0,
      });
    }
    globalIdx += wordLen + 1;
  }
  return candidates;
}

function buildKashidaString(lineText, candidates) {
  const insertionMap = new Map();
  for (const c of candidates) {
    if (c.currentKashidas > 0) insertionMap.set(c.fullIndex, c.currentKashidas);
  }
  const chars = [];
  for (let i = 0; i < lineText.length; i++) {
    chars.push(lineText[i]);
    const count = insertionMap.get(i + 1) || 0;
    if (count > 0) chars.push(TATWEEL.repeat(count));
  }
  return chars.join("");
}

function kashidaJustifyLine(lineText, targetWidth, fontFamily, fontSize, maxKashidasPerWord = 5) {
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

  while (distributedCount < targetCount) {
    let bestCandidate = null;
    let highestScore = -9999;

    for (const cand of candidates) {
      let score = 0;
      if (cand.isBeforeLastLetter) score += 4;
      if (cand.isLastWord) score += 3;
      else if (cand.isFirstWord) score += 2;
      if (FLAT_LETTERS.has(cand.charCode)) score += 1;
      if (cand.wordLength > 4) score += 1;
      else if (cand.wordLength < 3) score -= 2;
      score -= cand.currentKashidas * 6;
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
  let finalWidth = measureText(result, fontFamily, fontSize);
  while (finalWidth > targetWidth && distributedCount > 0) {
    let worst = null;
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

function splitTextIntoLines(rawText, fontFamily, fontSize, availableWidth, kashida) {
  const spaceWidth = measureText(" ", fontFamily, fontSize);
  const paragraphs = rawText.split("\n");
  const result = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push({ text: "", isJustified: false });
      continue;
    }

    const paragraphLines = [];
    let currentWords = [];
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

    for (let i = 0; i < paragraphLines.length; i++) {
      const isLast = i === paragraphLines.length - 1;
      if (kashida && !isLast) {
        const justified = kashidaJustifyLine(
          paragraphLines[i],
          availableWidth,
          fontFamily,
          fontSize
        );
        result.push({ text: justified, isJustified: true });
      } else {
        result.push({ text: paragraphLines[i], isJustified: false });
      }
    }
  }
  return result;
}

function computeLineHeight(fontFamily, fontSize, lineSpacing, useMetricsLineSpacing) {
  if (!useMetricsLineSpacing) {
    return fontSize * lineSpacing;
  }
  const ctx = getCtx();
  if (!ctx) return fontSize * lineSpacing;
  ctx.font = `${fontSize}px "${fontFamily}"`;
  const m = ctx.measureText("ب");
  const rawHeight =
    (m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || fontSize) +
    (m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || 0);
  return rawHeight * lineSpacing;
}

function useArabicTextFit(input) {
  const {
    text, fontFamily, baseFontSize, minFontSize, availableWidth,
    maxHeight, lineSpacing, useMetricsLineSpacing, kashida,
  } = input;

  return React.useMemo(() => {
    if (!text || availableWidth <= 0 || maxHeight <= 0) {
      return {
        lines: [],
        fontSize: minFontSize,
        lineHeight: computeLineHeight(fontFamily, minFontSize, lineSpacing, useMetricsLineSpacing),
      };
    }
    let lo = minFontSize;
    let hi = baseFontSize;
    let bestFontSize = minFontSize;
    let bestLines = [];
    let bestLineHeight = computeLineHeight(fontFamily, minFontSize, lineSpacing, useMetricsLineSpacing);

    const totalHeight = (fs) => {
      const lh = computeLineHeight(fontFamily, fs, lineSpacing, useMetricsLineSpacing);
      const ls = splitTextIntoLines(text, fontFamily, fs, availableWidth, kashida);
      return { height: ls.length * lh, lines: ls, lineHeight: lh };
    };

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const { height, lines, lineHeight } = totalHeight(mid);
      if (height <= maxHeight) {
        bestFontSize = mid;
        bestLines = lines;
        bestLineHeight = lineHeight;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (bestLines.length === 0) {
      const { lines, lineHeight } = totalHeight(minFontSize);
      bestLines = lines;
      bestLineHeight = lineHeight;
      bestFontSize = minFontSize;
    }

    return { lines: bestLines, fontSize: bestFontSize, lineHeight: bestLineHeight };
  }, [text, fontFamily, baseFontSize, minFontSize, availableWidth, maxHeight, lineSpacing, useMetricsLineSpacing, kashida]);
}

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1440;

const FittedTextBox = ({ text, layer, opacity = 1, fontFamilyOverride, textColorOverride }) => {
  const style = layer.style || {};
  const fontFamily = fontFamilyOverride || style.font_family || "GhroobArabic";
  const direction = style.direction || "rtl";
  const align = style.align || "right";
  const color = textColorOverride || style.color || "#FFFFFF";
  const verticalAlign = style.vertical_align || "top";

  const { lines, fontSize, lineHeight } = useArabicTextFit({
    text,
    fontFamily,
    baseFontSize: style.base_font_size || 70,
    minFontSize: style.min_font_size || 40,
    availableWidth: layer.width,
    maxHeight: layer.max_height,
    lineSpacing: style.line_spacing || 1.2,
    useMetricsLineSpacing: style.use_metrics_line_spacing || false,
    kashida: style.kashida || false,
  });

  const totalTextHeight = lines.length * lineHeight;
  let verticalOffset = 0;
  if (verticalAlign === "center") {
    verticalOffset = (layer.max_height - totalTextHeight) / 2;
  } else if (verticalAlign === "bottom") {
    verticalOffset = layer.max_height - totalTextHeight;
  }

  const cssTextAlign = align === "center" ? "center" : direction === "rtl" ? "right" : "left";

  return (
    <div
      style={{
        position: "absolute",
        top: layer.y + verticalOffset,
        left: layer.x - layer.width / 2,
        width: layer.width,
        height: layer.max_height,
        overflow: "hidden",
        opacity,
        zIndex: 3,
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily,
            fontSize,
            lineHeight: `${lineHeight}px`,
            color,
            direction,
            textAlign: cssTextAlign,
            unicodeBidi: "plaintext",
            whiteSpace: "pre",
            height: lineHeight,
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
};

const RasdNewsTemplate = ({ item }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const props = (item && item.props) || {};
  const photoSrc = props.photoSrc || "rasd/sample-photo.jpg";
  const backgroundImageSrc = props.backgroundImageSrc || "rasd/template-bg.png";
  const sourceText = props.sourceText || "عاجل";
  const fontFamily = props.fontFamily || "GhroobArabic";
  const textColor = props.textColor || "#FFFFFF";

  const quotes = [
    {
      text: props.quote1 || "ترامب لفوكس نيوز: سنصبح حماة مضيق هرمز وربما نطلق على أنفسنا لقب الملاك الحارس للمضيق",
      fadeInStart: 0,
      fullyVisibleStart: 0,
      fadeOutStart: 108,
      hiddenAt: 120,
      loopFadeInStart: 623,
    },
    {
      text: props.quote2 || "ترامب لفوكس نيوز: كنا نحرس مضيق هرمز دون مقابل أما الآن فسنحرسه ونحصل على مقابل لذلك",
      fadeInStart: 135,
      fullyVisibleStart: 147,
      fadeOutStart: 321,
      hiddenAt: 336,
    },
    {
      text: props.quote3 || "ترامب لفوكس نيوز: ينبغي أن نتقاضى مقابلا على حراسة المضيق وعندما نقوم بحراسته سنحصل على تعويض",
      fadeInStart: 350,
      fullyVisibleStart: 363,
      fadeOutStart: 609,
      hiddenAt: 616,
    },
  ];

  const newsTextLayer = {
    id: "text_default_news",
    type: "text",
    x: 526,
    y: 900,
    width: 908,
    max_height: 383,
    style: {
      align: "right",
      color: textColor,
      kashida: true,
      direction: "rtl",
      font_family: fontFamily,
      line_spacing: 0.9,
      min_font_size: 50,
      base_font_size: 150,
      vertical_align: "top",
      use_metrics_line_spacing: true,
    },
  };

  const sourceTextLayer = {
    id: "text_default_source",
    type: "text",
    x: 858,
    y: 1370,
    width: 206,
    max_height: 47,
    style: {
      align: "right",
      color: textColor,
      kashida: false,
      direction: "rtl",
      font_family: fontFamily,
      line_spacing: 1.2,
      min_font_size: 30,
      base_font_size: 80,
      vertical_align: "center",
      use_metrics_line_spacing: false,
    },
  };

  return (
    <AbsoluteFill
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Img
          src={backgroundImageSrc.startsWith("http") ? backgroundImageSrc : staticFile(backgroundImageSrc)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            objectFit: "cover",
          }}
        />
      </div>

      <Img
        src={photoSrc.startsWith("http") ? photoSrc : staticFile(photoSrc)}
        style={{
          position: "absolute",
          top: -1,
          left: 0,
          width: 1080,
          height: 860,
          objectFit: "cover",
          zIndex: 1,
        }}
      />

      {quotes.map((quote, index) => {
        const fadeInLen = quote.fullyVisibleStart - quote.fadeInStart;
        const input = [];
        const output = [];
        if (fadeInLen > 0) {
          input.push(quote.fadeInStart);
          output.push(0);
        }
        input.push(quote.fullyVisibleStart);
        output.push(1);
        input.push(quote.fadeOutStart);
        output.push(1);
        input.push(quote.hiddenAt);
        output.push(0);

        let opacity = interpolate(frame, input, output, {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        if (quote.loopFadeInStart != null && frame >= quote.loopFadeInStart) {
          opacity = interpolate(
            frame,
            [quote.loopFadeInStart, durationInFrames],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
        }

        return (
          <FittedTextBox
            key={index}
            text={quote.text}
            layer={newsTextLayer}
            opacity={opacity}
            fontFamilyOverride={fontFamily}
            textColorOverride={textColor}
          />
        );
      })}

      <FittedTextBox
        text={sourceText}
        layer={sourceTextLayer}
        fontFamilyOverride={fontFamily}
        textColorOverride={textColor}
      />
    </AbsoluteFill>
  );
};
