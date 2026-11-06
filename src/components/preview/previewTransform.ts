import { isBackgroundFillActive } from '../../editor/backgroundFill';
import {
  flexCropVisibleRect,
  compactFlexCrop,
  normalizedFlexCrop,
  PREVIEW_CROP_MIN_SPAN,
} from '../../editor/flexCrop';
import { resolveClipScaleAxes } from '../../editor/clipTransformScale';
import { coerceKeyframeValue } from '../../editor/keyframeRegistry';
import { sampleKeyframes } from '../../editor/keyframes';
import {
  clampVisualBorderRadius,
  objectFitInsideVisualFrame,
  visibleVisualFrameRect,
} from '../../editor/visualFrameGeometry';
import {
  isVisualItemKind,
  timelineTrackIds,
  trackKind,
  type FlexCrop,
  type ClipTransform,
  type KeyframeProp,
  type TimelineItem,
  type TimelineState,
} from '../../editor/types';

export {
  flexCropEdgeMax,
  flexCropInsetPatch,
  compactFlexCrop,
  hasFlexCrop,
  normalizedFlexCrop,
  PREVIEW_CROP_MIN_SPAN,
  type FlexCropEdge,
} from '../../editor/flexCrop';

export interface PreviewPoint { x: number; y: number }
export interface PreviewSize { width: number; height: number }
export interface PreviewRect extends PreviewPoint, PreviewSize {}

/** Edge of the selection box (local axes after rotation). */
export type PreviewScaleEdge = 'n' | 's' | 'e' | 'w';

export interface EffectivePreviewTransform {
  x: number;
  y: number;
  /** Uniform fallback (legacy / linked axes). */
  scale: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface PreviewCandidate {
  item: TimelineItem;
  transform: EffectivePreviewTransform;
  localFrame: number;
}

export interface ClickCycleState {
  point: PreviewPoint;
  candidateIds: string[];
  index: number;
}

export interface PreviewCandidateGeometry {
  baseRect: PreviewRect;
  center: PreviewPoint;
  corners: readonly [PreviewPoint, PreviewPoint, PreviewPoint, PreviewPoint];
}

export { clampVisualBorderRadius, objectFitInsideVisualFrame, visibleVisualFrameRect };

export type PreviewNudgeDirection = 'left' | 'right' | 'up' | 'down';

export type KeyboardPreviewNudgePlan =
  | { itemId: string; transform: Pick<ClipTransform, 'x' | 'y'> }
  | { itemId: string; keyframe: { prop: 'x' | 'y'; localFrame: number; value: number } };

const valueAtFrame = (item: TimelineItem, prop: KeyframeProp, localFrame: number): number | undefined => {
  const keyframes = item.keyframes?.[prop];
  return keyframes?.length ? sampleKeyframes(keyframes, localFrame) : undefined;
};

export function effectivePreviewTransform(item: TimelineItem, absoluteFrame: number): EffectivePreviewTransform {
  const localFrame = Math.max(0, Math.round(absoluteFrame) - item.startFrame);
  const keyframed = {
    scale: valueAtFrame(item, 'scale', localFrame),
    scaleX: valueAtFrame(item, 'scaleX', localFrame),
    scaleY: valueAtFrame(item, 'scaleY', localFrame),
  };
  const { scaleX, scaleY } = resolveClipScaleAxes(item.transform, keyframed);
  const uniform = Math.abs(scaleX - scaleY) < 1e-6
    ? scaleX
    : (keyframed.scale ?? item.transform?.scale ?? scaleX);
  return {
    x: valueAtFrame(item, 'x', localFrame) ?? item.transform?.x ?? 0,
    y: valueAtFrame(item, 'y', localFrame) ?? item.transform?.y ?? 0,
    scale: uniform,
    scaleX,
    scaleY,
    rotation: valueAtFrame(item, 'rotation', localFrame) ?? item.transform?.rotation ?? 0,
  };
}

export function visiblePreviewCandidates(state: TimelineState, absoluteFrame: number): PreviewCandidate[] {
  const visualTracks = timelineTrackIds(state).filter((id) => trackKind(state, id) === 'video');
  const paintOrder = state.items
    .filter((item) => (
      isVisualItemKind(item.kind)
      && visualTracks.includes(item.track)
      && !state.tracks?.[item.track]?.hidden
      && !state.tracks?.[item.track]?.locked
      && absoluteFrame >= item.startFrame
      && absoluteFrame < item.startFrame + item.durationInFrames
    ))
    .sort((a, b) => (
      a.track === b.track
        ? a.startFrame - b.startFrame
        : visualTracks.indexOf(b.track) - visualTracks.indexOf(a.track)
    ));

  return paintOrder.reverse().map((item) => ({
    item,
    localFrame: Math.max(0, Math.round(absoluteFrame) - item.startFrame),
    transform: effectivePreviewTransform(item, absoluteFrame),
  }));
}

const approxArabicTextWidth = (text: string, fontSize: number, minWidth = 140): number => (
  Math.max(minWidth, Math.round(Array.from(text.trim()).length * fontSize * 0.48))
);

function layoutOffsetRelativeTo(el: HTMLElement, ancestor: HTMLElement): PreviewPoint {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    const parent: HTMLElement | null = cur.offsetParent as HTMLElement | null;
    if (!parent || !ancestor.contains(parent)) break;
    cur = parent;
  }
  return { x, y };
}

function measureDomMotionGraphicRect(
  itemId: string,
  sourceWidth: number,
  sourceHeight: number,
): PreviewRect | null {
  if (typeof document === 'undefined' || !itemId) return null;
  const candidates = document.querySelectorAll<HTMLElement>('[data-occ-mg-root]');
  let rootEl: HTMLElement | null = null;
  for (const el of candidates) {
    if (el.getAttribute('data-occ-mg-root') === itemId) {
      rootEl = el;
      break;
    }
  }
  if (!rootEl || rootEl.offsetWidth <= 0 || rootEl.offsetHeight <= 0) return null;

  const firstChild = rootEl.firstElementChild as HTMLElement | null;
  let scaleX = 1;
  let scaleY = 1;
  let refW = sourceWidth;
  let refH = sourceHeight;
  if (firstChild && firstChild.offsetWidth > 0 && firstChild.offsetHeight > 0) {
    const scaleMatch = firstChild.style?.transform?.match(/scale\(\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+))?\s*\)/);
    if (scaleMatch) {
      const sx = Number(scaleMatch[1]);
      const sy = Number(scaleMatch[2] ?? scaleMatch[1]);
      if (Number.isFinite(sx) && sx > 0) scaleX = sx;
      if (Number.isFinite(sy) && sy > 0) scaleY = sy;
      refW = firstChild.offsetWidth;
      refH = firstChild.offsetHeight;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includeElement = (el: HTMLElement) => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w <= 0 || h <= 0) return;
    const pos = layoutOffsetRelativeTo(el, rootEl!);
    minX = Math.min(minX, pos.x * scaleX);
    minY = Math.min(minY, pos.y * scaleY);
    maxX = Math.max(maxX, (pos.x + w) * scaleX);
    maxY = Math.max(maxY, (pos.y + h) * scaleY);
    // Include persistent overflowing badge children (e.g. top quote badge at top: -92px)
    for (const child of Array.from(el.children) as HTMLElement[]) {
      if (child.offsetWidth > 0 && child.offsetHeight > 0 && child.offsetTop < 0) {
        const cPos = layoutOffsetRelativeTo(child, rootEl!);
        minX = Math.min(minX, cPos.x * scaleX);
        minY = Math.min(minY, cPos.y * scaleY);
        maxX = Math.max(maxX, (cPos.x + child.offsetWidth) * scaleX);
        maxY = Math.max(maxY, (cPos.y + child.offsetHeight) * scaleY);
      }
    }
  };

  const tagged = rootEl.querySelectorAll<HTMLElement>('[data-occ-bounds="true"]');
  if (tagged.length > 0) {
    for (const el of tagged) includeElement(el);
  } else {
    const walk = (container: HTMLElement) => {
      for (const child of Array.from(container.children) as HTMLElement[]) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'style' || tag === 'defs') continue;
        const w = child.offsetWidth;
        const h = child.offsetHeight;
        if (w <= 0 || h <= 0) continue;
        const bg = `${child.style?.background ?? ''} ${child.style?.backgroundImage ?? ''}`;
        if (bg.includes('linear-gradient') && w >= refW * 0.85 && h >= refH * 0.45) continue;
        const isFullCanvas = w >= refW * 0.92 && h >= refH * 0.85;
        const isFullWidthWrapper = w >= refW * 0.92 && child.children.length > 0 && !child.style?.backgroundColor;
        if (isFullCanvas || isFullWidthWrapper) {
          walk(child);
        } else {
          includeElement(child);
        }
      }
    };
    walk(rootEl);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) return null;
  const clampedX = Math.max(0, Math.min(sourceWidth, minX));
  const clampedY = Math.max(0, Math.min(sourceHeight, minY));
  const clampedRight = Math.max(clampedX, Math.min(sourceWidth, maxX));
  const clampedBottom = Math.max(clampedY, Math.min(sourceHeight, maxY));
  const boxW = clampedRight - clampedX;
  const boxH = clampedBottom - clampedY;
  if (boxW < 16 || boxH < 16) return null;
  if (boxW >= sourceWidth * 0.98 && boxH >= sourceHeight * 0.98) return null;
  return {
    x: clampedX,
    y: clampedY,
    width: boxW,
    height: boxH,
  };
}

function estimateMotionGraphicRect(
  item: TimelineItem,
  sourceWidth: number,
  sourceHeight: number,
): PreviewRect | null {
  const props = (item.props ?? {}) as Record<string, unknown>;
  const id = `${item.templateId ?? ''} ${item.name ?? ''}`.toLowerCase();
  const code = item.code ?? '';

  // 1. Rssd Location Badge (locationOnly)
  if (
    id.includes('rssd-location-badge')
    || id.includes('location badge')
    || props.locationOnly === true
  ) {
    const iconSize = Number(props.locationIconSize ?? 36);
    const locFontSize = Number(props.locationFontSize ?? 42);
    const locText = String(props.locationText ?? 'القاهرة');
    const rightOffset = Number(props.rightOffset ?? 238);
    const bottomOffset = Number(props.bottomOffset ?? 900);
    const w = Math.min(sourceWidth - 20, iconSize + 12 + approxArabicTextWidth(locText, locFontSize, 90) + 20);
    const h = Math.max(Math.round(iconSize * 1.3), Math.round(locFontSize * 1.25)) + 16;
    return {
      x: Math.max(0, sourceWidth - rightOffset - w),
      y: Math.max(0, sourceHeight - bottomOffset - h),
      width: w,
      height: h,
    };
  }

  // 2. Rssd Location & Headline
  if (
    id.includes('rssd-location-headline')
    || id.includes('rssd location')
    || code.includes('RssdLocationHeadline')
    || (props.locationText !== undefined && props.line1Text !== undefined)
  ) {
    const lineCount = Number(props.lineCount ?? 2);
    const f1 = Number(props.line1FontSize ?? 74);
    const f2 = Number(props.line2FontSize ?? 80);
    const f3 = Number(props.line3FontSize ?? 74);
    const padX = Number(props.boxPaddingX ?? 34);
    const bh1 = Number(props.boxHeight1 ?? 110);
    const bh2 = Number(props.boxHeight2 ?? 118);
    const bh3 = Number(props.boxHeight3 ?? 118);
    const gap = Number(props.gap ?? 10);
    const showLoc = props.showLocation !== false;
    const locH = showLoc
      ? Math.round(Number(props.locationIconSize ?? 36) * 1.3) + Number(props.locationBottomGap ?? 22)
      : 0;
    const w1 = approxArabicTextWidth(String(props.line1Text ?? 'انقلاب سيارة على'), f1) + padX * 2;
    const w2 = lineCount >= 2 ? approxArabicTextWidth(String(props.line2Text ?? 'طريق مصر الصحراوي'), f2) + padX * 2 : 0;
    const w3 = lineCount >= 3 ? approxArabicTextWidth(String(props.line3Text ?? ''), f3) + padX * 2 : 0;
    const w = Math.min(sourceWidth - 20, Math.max(w1, w2, w3, 220));
    const h = locH + bh1 + (lineCount >= 2 ? gap + bh2 : 0) + (lineCount >= 3 ? gap + bh3 : 0);
    const rightOffset = Number(props.rightOffset ?? 238);
    const bottomOffset = Number(props.bottomOffset ?? 648);
    return {
      x: Math.max(0, sourceWidth - rightOffset - w),
      y: Math.max(0, sourceHeight - bottomOffset - h),
      width: w,
      height: h,
    };
  }

  // 3. Rssd Text Headline
  if (id.includes('rssd-text') || id.includes('rssd text') || code.includes('RssdTextTemplate')) {
    const lineCount = Number(props.lineCount ?? 2);
    const fontSize = Number(props.fontSize ?? 80);
    const padX = Number(props.boxPaddingX ?? 34);
    const gap = Number(props.gap ?? 12);
    const rightOffset = Number(props.rightOffset ?? 101);
    const bottomOffset = Number(props.bottomOffset ?? 253);
    const w1 = approxArabicTextWidth(String(props.line1Text ?? 'السطر الأول يكتب هنا'), fontSize) + padX * 2;
    const w2 = lineCount >= 2 ? approxArabicTextWidth(String(props.line2Text ?? 'ثم يأتي السطر الثاني'), fontSize) + padX * 2 : 0;
    const w3 = lineCount >= 3 ? approxArabicTextWidth(String(props.line3Text ?? 'فالثالث'), fontSize) + padX * 2 : 0;
    const w = Math.min(sourceWidth - 20, Math.max(w1, w2, w3, 240));
    const h = 120 + (lineCount >= 2 ? gap + 116 : 0) + (lineCount >= 3 ? gap + 116 : 0) + (props.showSource ? 58 : 0);
    return {
      x: Math.max(0, sourceWidth - rightOffset - w),
      y: Math.max(0, sourceHeight - bottomOffset - h),
      width: w,
      height: h,
    };
  }

  // 4. Rssd Raw Badge
  if (id.includes('rssd-raw') || id.includes('rssd raw') || code.includes('RssdRawTemplate')) {
    const fontSize = Number(props.fontSize ?? 92);
    const padX = Number(props.boxPaddingX ?? 42);
    const topOffset = Number(props.topOffset ?? 684);
    const rightOffset = Number(props.rightOffset ?? 137);
    const w1 = approxArabicTextWidth(String(props.line1Text ?? 'القضية الفلسطينية'), fontSize) + padX * 2;
    const w2 = approxArabicTextWidth(String(props.line2Text ?? 'روهات رصد'), fontSize) + padX * 2;
    const w = Math.min(sourceWidth - 20, Math.max(w1, w2, 260));
    const h = 144 + 4 + 144 + (props.showAccentBlock !== false ? 24 : 0);
    return {
      x: Math.max(0, sourceWidth - rightOffset - w),
      y: Math.max(0, topOffset),
      width: w,
      height: h,
    };
  }

  // 5. Rssd Quote Card
  if (
    id.includes('rssd-quote')
    || id.includes('rssd quote')
    || code.includes('RssdQuoteTemplate')
    || props.quoteText !== undefined
  ) {
    const cardWidth = Number(props.cardWidth ?? 866);
    const cardHeight = Number(props.cardHeight ?? 544);
    const topOffset = Number(props.topOffset ?? 415);
    const rightOffset = Number(props.rightOffset ?? 101);
    const attrH = props.showAttribution !== false ? 97 : 0;
    const badgeTop = 92;
    const w = Math.min(sourceWidth - 20, cardWidth);
    const h = cardHeight + attrH + badgeTop;
    return {
      x: Math.max(0, sourceWidth - rightOffset - w),
      y: Math.max(0, topOffset - badgeTop),
      width: w,
      height: h,
    };
  }

  // 6. Arabic Blue News Boxes
  if (
    id.includes('arabic-blue-news-boxes')
    || id.includes('3-line custom boxes')
    || code.includes('ArabicBlueNewsBoxes')
  ) {
    const fontSize = Number(props.fontSize ?? 76);
    const boxHeight = Number(props.boxHeight ?? 112);
    const gap = Number(props.gap ?? 26);
    const yOffsetPercent = Number(props.yOffsetPercent ?? 54.4);
    const rightMargin = Number(props.rightMargin ?? 54);
    const lines = [
      props.line1Text ?? 'أصول جديدة',
      props.line2Text ?? 'تدخل قائمة البيع',
      props.line3Text ?? 'وتحذيرات تفاقم أزمة الديون',
    ]
      .map((s) => String(s ?? ''))
      .filter((s) => s.trim().length > 0);
    const count = Math.max(1, lines.length);
    const w = Math.min(
      sourceWidth - rightMargin,
      Math.max(...lines.map((l) => approxArabicTextWidth(l, fontSize) + 80), 260),
    );
    const h = count * boxHeight + (count - 1) * gap + 22;
    return {
      x: Math.max(0, sourceWidth - rightMargin - w),
      y: Math.max(0, Math.round(sourceHeight * (yOffsetPercent / 100)) - 22),
      width: w,
      height: h,
    };
  }

  // 7. Arabic Headline Boxes (Red & White)
  if (
    id.includes('arabic-headline-boxes')
    || id.includes('red & white boxes')
    || code.includes('ArabicHeadlineBoxes')
    || props.topText !== undefined
  ) {
    const fontSize = Number(props.fontSize ?? 64);
    const gap = Number(props.gap ?? 14);
    const yOffsetPercent = Number(props.yOffsetPercent ?? 68);
    const topText = String(props.topText ?? 'أشيلكم إنتوا التلاتة');
    const bottomText = String(props.bottomText ?? 'ربنا يخليك لينا يا بابا');
    const w = Math.min(
      sourceWidth - 60,
      Math.max(approxArabicTextWidth(topText, fontSize) + 68, approxArabicTextWidth(bottomText, fontSize) + 68, 260),
    );
    const h = 108 * 2 + gap + (props.showSubtitle !== false ? 64 : 0);
    return {
      x: Math.max(0, sourceWidth - 60 - w),
      y: Math.max(0, Math.round(sourceHeight * (yOffsetPercent / 100))),
      width: w,
      height: h,
    };
  }

  // 8. Rasd Quote Single
  if (id.includes('rasd-quote-single') || id.includes('rasd quote') || code.includes('CONNECTABLE_LETTERS')) {
    const w = Number(props.width ?? Math.round(sourceWidth * 0.85));
    const h = Number(props.max_height ?? Math.round(sourceHeight * 0.4));
    return {
      x: Math.max(0, Math.round((sourceWidth - w) / 2)),
      y: Math.max(0, Math.round(sourceHeight * 0.45)),
      width: Math.min(sourceWidth, w),
      height: Math.min(sourceHeight, h),
    };
  }

  return null;
}

function previewBaseRect(state: TimelineState, item: TimelineItem): PreviewRect {
  if (state.width <= 0 || state.height <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const canvas = { x: 0, y: 0, width: state.width, height: state.height };
  let content = canvas;
  if (item.kind !== 'solid') {
    const sourceWidth = item.width && item.width > 0 ? item.width : state.width;
    const sourceHeight = item.height && item.height > 0 ? item.height : state.height;
    content = visibleVisualFrameRect(
      { width: state.width, height: state.height },
      { width: sourceWidth, height: sourceHeight },
      isBackgroundFillActive(state, item) ? 'contain' : (state.fit ?? 'contain'),
    );
    if (item.kind === 'motion-graphic' && content.width > 0 && content.height > 0) {
      const localBounds = measureDomMotionGraphicRect(item.id, sourceWidth, sourceHeight)
        ?? estimateMotionGraphicRect(item, sourceWidth, sourceHeight);
      if (localBounds) {
        const sx = content.width / sourceWidth;
        const sy = content.height / sourceHeight;
        content = {
          x: Math.round(content.x + localBounds.x * sx),
          y: Math.round(content.y + localBounds.y * sy),
          width: Math.max(16, Math.round(localBounds.width * sx)),
          height: Math.max(16, Math.round(localBounds.height * sy)),
        };
      }
    }
  }

  const crop = item.transform?.crop;
  if (!crop) return content;
  return flexCropVisibleRect(crop, state.width, state.height, content);
}

const rotatePoint = (point: PreviewPoint, center: PreviewPoint, degrees: number): PreviewPoint => {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
};

const applyTransform = (
  state: Pick<TimelineState, 'width' | 'height'>,
  point: PreviewPoint,
  transform: EffectivePreviewTransform,
): PreviewPoint => {
  // Same origin as CSS `transform-origin: 50% 50%` on the full-canvas layer.
  const center = { x: state.width / 2, y: state.height / 2 };
  const scaled = {
    x: center.x + (point.x - center.x) * transform.scaleX,
    y: center.y + (point.y - center.y) * transform.scaleY,
  };
  const rotated = rotatePoint(scaled, center, transform.rotation);
  return {
    x: rotated.x + transform.x / 100 * state.width,
    y: rotated.y + transform.y / 100 * state.height,
  };
};

export function previewCandidateGeometry(state: TimelineState, candidate: PreviewCandidate): PreviewCandidateGeometry {
  const baseRect = previewBaseRect(state, candidate.item);
  const rawCorners = [
    { x: baseRect.x, y: baseRect.y },
    { x: baseRect.x + baseRect.width, y: baseRect.y },
    { x: baseRect.x + baseRect.width, y: baseRect.y + baseRect.height },
    { x: baseRect.x, y: baseRect.y + baseRect.height },
  ] as const;
  const corners = rawCorners.map((point) => applyTransform(state, point, candidate.transform)) as unknown as PreviewCandidateGeometry['corners'];
  const rawCenter = { x: baseRect.x + baseRect.width / 2, y: baseRect.y + baseRect.height / 2 };
  return { baseRect, center: applyTransform(state, rawCenter, candidate.transform), corners };
}

const inverseTransform = (
  state: Pick<TimelineState, 'width' | 'height'>,
  point: PreviewPoint,
  transform: EffectivePreviewTransform,
): PreviewPoint => {
  const center = { x: state.width / 2, y: state.height / 2 };
  const translated = {
    x: point.x - transform.x / 100 * state.width,
    y: point.y - transform.y / 100 * state.height,
  };
  const rotated = rotatePoint(translated, center, -transform.rotation);
  const safeX = Math.abs(transform.scaleX) < 1e-6 ? 1e-6 : transform.scaleX;
  const safeY = Math.abs(transform.scaleY) < 1e-6 ? 1e-6 : transform.scaleY;
  return {
    x: center.x + (rotated.x - center.x) / safeX,
    y: center.y + (rotated.y - center.y) / safeY,
  };
};

export function hitPreviewCandidates(state: TimelineState, absoluteFrame: number, point: PreviewPoint): PreviewCandidate[] {
  return visiblePreviewCandidates(state, absoluteFrame).filter((candidate) => {
    const rect = previewBaseRect(state, candidate.item);
    if (!rect.width || !rect.height) return false;
    const local = inverseTransform(state, point, candidate.transform);
    return local.x >= rect.x && local.x <= rect.x + rect.width
      && local.y >= rect.y && local.y <= rect.y + rect.height;
  });
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean => (
  a.length === b.length && a.every((id, index) => id === b[index])
);

export function cyclePreviewCandidate(
  previous: ClickCycleState | null,
  point: PreviewPoint,
  candidates: readonly PreviewCandidate[],
  tolerance: number,
): { id: string; next: ClickCycleState } | null {
  if (!candidates.length) return null;
  const candidateIds = candidates.map(({ item }) => item.id);
  const repeated = !!previous
    && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <= tolerance
    && sameIds(previous.candidateIds, candidateIds);
  const index = repeated ? (previous.index + 1) % candidateIds.length : 0;
  return {
    id: candidateIds[index]!,
    next: { point, candidateIds, index },
  };
}

export function movePreviewTransform(
  start: EffectivePreviewTransform,
  deltaPreview: PreviewPoint,
  previewSize: PreviewSize,
): Pick<ClipTransform, 'x' | 'y'> {
  const dx = previewSize.width > 0 ? deltaPreview.x / previewSize.width * 100 : 0;
  const dy = previewSize.height > 0 ? deltaPreview.y / previewSize.height * 100 : 0;
  return {
    x: coerceKeyframeValue('x', start.x + dx),
    y: coerceKeyframeValue('y', start.y + dy),
  };
}

/**
 * Map a viewport client point onto the current preview canvas.
 * Always pass the live getBoundingClientRect() — a cached overlay origin
 * treats inspector open/close (canvas recenter) as a drag.
 */
export function previewPointerFromClient(
  client: PreviewPoint,
  canvas: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  composition: Pick<TimelineState, 'width' | 'height'>,
): { ui: PreviewPoint; composition: PreviewPoint } {
  const ui = { x: client.x - canvas.left, y: client.y - canvas.top };
  return {
    ui,
    composition: {
      x: canvas.width > 0 ? ui.x / canvas.width * composition.width : 0,
      y: canvas.height > 0 ? ui.y / canvas.height * composition.height : 0,
    },
  };
}

/** Screen-space pointer delta. Overlay translation/resize must not count. */
export function previewClientDelta(startClient: PreviewPoint, currentClient: PreviewPoint): PreviewPoint {
  return { x: currentClient.x - startClient.x, y: currentClient.y - startClient.y };
}

/**
 * Build one keyboard nudge against the exact transform value currently shown by
 * the preview and Inspector. Existing x/y curves receive a keyframe at the
 * playhead; un-keyframed clips update their static transform instead.
 */
export function keyboardPreviewNudgePlan(
  item: TimelineItem,
  absoluteFrame: number,
  direction: PreviewNudgeDirection,
  step = 1,
): KeyboardPreviewNudgePlan | null {
  if (!isVisualItemKind(item.kind)) return null;
  const prop: 'x' | 'y' = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const delta = direction === 'left' || direction === 'up' ? -step : step;
  const localFrame = Math.round(absoluteFrame) - item.startFrame;
  if (localFrame < 0 || localFrame >= item.durationInFrames) return null;
  const keyframes = item.keyframes?.[prop];
  const current = effectivePreviewTransform(item, absoluteFrame)[prop];
  const value = coerceKeyframeValue(prop, current + delta);
  if (keyframes?.length) return { itemId: item.id, keyframe: { prop, localFrame, value } };
  return { itemId: item.id, transform: { [prop]: value } };
}

export function scalePreviewTransform(
  startScale: number,
  center: PreviewPoint,
  startPoint: PreviewPoint,
  currentPoint: PreviewPoint,
): number {
  const startDistance = Math.hypot(startPoint.x - center.x, startPoint.y - center.y);
  if (startDistance < 1e-6) return Math.max(0.05, coerceKeyframeValue('scale', startScale));
  const distance = Math.hypot(currentPoint.x - center.x, currentPoint.y - center.y);
  return Math.max(0.05, coerceKeyframeValue('scale', startScale * distance / startDistance));
}

/** Corner drag: both axes grow by the same distance factor (keeps aspect). */
export function uniformScaleAxesPreviewTransform(
  start: Pick<EffectivePreviewTransform, 'scaleX' | 'scaleY'>,
  center: PreviewPoint,
  startPoint: PreviewPoint,
  currentPoint: PreviewPoint,
): Pick<ClipTransform, 'scale' | 'scaleX' | 'scaleY'> {
  const startDistance = Math.hypot(startPoint.x - center.x, startPoint.y - center.y);
  const factor = startDistance < 1e-6
    ? 1
    : Math.hypot(currentPoint.x - center.x, currentPoint.y - center.y) / startDistance;
  const scaleX = Math.max(0.05, coerceKeyframeValue('scaleX', start.scaleX * factor));
  const scaleY = Math.max(0.05, coerceKeyframeValue('scaleY', start.scaleY * factor));
  const linked = Math.abs(scaleX - scaleY) < 1e-6;
  return linked
    ? { scale: scaleX, scaleX, scaleY }
    : { scaleX, scaleY };
}

const projectOnAxis = (
  center: PreviewPoint,
  point: PreviewPoint,
  axis: PreviewPoint,
): number => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return dx * axis.x + dy * axis.y;
};

/**
 * Edge drag: crop (cover/hide) the dragged-over region — not stretch.
 * Pointer is inverse-transformed into layer space; that edge of the crop window
 * snaps to the pointer while the opposite inset stays fixed.
 * Example: drag right edge left → increase crop.right, right side is masked out.
 */
export function edgeCropPreviewTransform(
  state: Pick<TimelineState, 'width' | 'height'>,
  transform: EffectivePreviewTransform,
  startCrop: FlexCrop | undefined,
  currentPoint: PreviewPoint,
  edge: PreviewScaleEdge,
): { crop: FlexCrop | undefined } {
  if (state.width <= 0 || state.height <= 0) {
    return { crop: compactFlexCrop(normalizedFlexCrop(startCrop)) };
  }
  const start = normalizedFlexCrop(startCrop);
  const local = inverseTransform(state, currentPoint, transform);
  const min = PREVIEW_CROP_MIN_SPAN;
  let { left, top, right, bottom } = start;
  if (edge === 'e') {
    const xPx = Math.round(local.x);
    const minX = Math.round((left + min) * state.width);
    const fx = Math.min(state.width, Math.max(minX, xPx));
    right = (state.width - fx) / state.width;
  } else if (edge === 'w') {
    const xPx = Math.round(local.x);
    const maxX = Math.round((1 - right - min) * state.width);
    const fx = Math.min(maxX, Math.max(0, xPx));
    left = fx / state.width;
  } else if (edge === 's') {
    const yPx = Math.round(local.y);
    const minY = Math.round((top + min) * state.height);
    const fy = Math.min(state.height, Math.max(minY, yPx));
    bottom = (state.height - fy) / state.height;
  } else {
    const yPx = Math.round(local.y);
    const maxY = Math.round((1 - bottom - min) * state.height);
    const fy = Math.min(maxY, Math.max(0, yPx));
    top = fy / state.height;
  }
  return { crop: compactFlexCrop({ left, top, right, bottom }) };
}

/** @deprecated Prefer edgeCropPreviewTransform — edge handles crop, they do not stretch. */
export function edgeScalePreviewTransform(
  start: Pick<EffectivePreviewTransform, 'scaleX' | 'scaleY' | 'rotation'>,
  center: PreviewPoint,
  startPoint: PreviewPoint,
  currentPoint: PreviewPoint,
  edge: PreviewScaleEdge,
): Pick<ClipTransform, 'scaleX' | 'scaleY'> {
  const rad = start.rotation * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const axisX = { x: cos, y: sin };
  const axisY = { x: -sin, y: cos };
  const horizontal = edge === 'e' || edge === 'w';
  const axis = horizontal ? axisX : axisY;
  const startProj = Math.abs(projectOnAxis(center, startPoint, axis));
  if (startProj < 1e-6) {
    return horizontal
      ? { scaleX: Math.max(0.05, start.scaleX) }
      : { scaleY: Math.max(0.05, start.scaleY) };
  }
  const factor = Math.abs(projectOnAxis(center, currentPoint, axis)) / startProj;
  if (horizontal) {
    return { scaleX: Math.max(0.05, coerceKeyframeValue('scaleX', start.scaleX * factor)) };
  }
  return { scaleY: Math.max(0.05, coerceKeyframeValue('scaleY', start.scaleY * factor)) };
}

const angle = (center: PreviewPoint, point: PreviewPoint): number => (
  Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI
);

export function rotatePreviewTransform(
  startRotation: number,
  center: PreviewPoint,
  startPoint: PreviewPoint,
  currentPoint: PreviewPoint,
): number {
  const delta = ((angle(center, currentPoint) - angle(center, startPoint) + 540) % 360) - 180;
  return coerceKeyframeValue('rotation', startRotation + delta);
}

/** Midpoints of the four edges in composition space (after transform). */
export function previewEdgeMidpoints(
  corners: readonly [PreviewPoint, PreviewPoint, PreviewPoint, PreviewPoint],
): Record<PreviewScaleEdge, PreviewPoint> {
  const mid = (a: PreviewPoint, b: PreviewPoint): PreviewPoint => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  return {
    n: mid(corners[0], corners[1]),
    e: mid(corners[1], corners[2]),
    s: mid(corners[2], corners[3]),
    w: mid(corners[3], corners[0]),
  };
}
