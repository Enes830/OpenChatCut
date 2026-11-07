import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { EmbeddedFonts } from './embeddedFonts';

const RASD_LOGO_DATA_URI = 'data:image/png;base64,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';

/**
 * Exact SVG Teardrop Location Map Pin extracted from Rssd - Date & Loc & Src.mogrt
 * Features outer circular head tapering to bottom vertex with circular cutout hole.
 */
export const LocationPinIcon: React.FC<{
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ size = 38, color = '#ffffff', style }) => {
  const width = size;
  const height = Math.round(size * 1.3);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 26 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        filter: 'drop-shadow(0 2px 5px rgba(0, 0, 0, 0.75))',
        ...style,
      }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13 0C5.82 0 0 5.82 0 13C0 22.2 13 34 13 34C13 34 26 22.2 26 13C26 5.82 20.18 0 13 0ZM13 18C10.24 18 8 15.76 8 13C8 10.24 10.24 8 13 8C15.76 8 18 10.24 18 13C18 15.76 15.76 18 13 18Z"
        fill={color}
      />
    </svg>
  );
};

export interface RssdLocationHeadlineProps {
  // ─── Location Props (Up) ───
  showLocation?: boolean;
  locationText?: string;
  locationColor?: string;
  locationFontSize?: number;
  locationIconSize?: number;
  locationGap?: number;
  locationBottomGap?: number;
  locationRightIndent?: number;
  locationOnly?: boolean;

  // ─── Headline Text Content ───
  line1Text?: string;
  line2Text?: string;
  showHeadline?: boolean;
  headlineDurationFrames?: number;

  // ─── Source Badge (Top-Left, e.g. @anas_habib) ───
  sourceOnly?: boolean;
  showSource?: boolean;
  sourceText?: string;
  sourceTop?: number;
  sourceLeft?: number;
  sourceBgColor?: string;
  sourceTextColor?: string;
  sourceFontSize?: number;

  // ─── Arabic Translation / Subtitle Box (Bottom-Center) ───
  showSubtitle?: boolean;
  subtitleText?: string;
  subtitleBottom?: number;
  subtitleBgColor?: string;
  subtitleTextColor?: string;
  subtitleFontSize?: number;

  // ─── Brand Logo (Top-Right Rasd ر ص د) ───
  showBrandLogo?: boolean;
  logoTop?: number;
  logoRight?: number;

  // ─── Colors & Themes ───
  accentColor?: string; // Brand Blue (#1283F9), Red (#f22d2d), Green (#00b8a7)
  line1BgColor?: string; // default #ffffff
  line1TextColor?: string; // default #000000
  line2BgColor?: string; // default #1283F9
  line2TextColor?: string; // default #ffffff
  backgroundColor?: string;
  showAccentBlock?: boolean;

  // ─── Typography ───
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;

  // ─── Layout & Positioning ───
  topOffset?: number;
  bottomOffset?: number;
  rightOffset?: number;
  boxPaddingX?: number;
  boxPaddingY?: number;
  boxHeight?: number | string;
  line1Height?: number | string;
  line2Height?: number | string;
  gap?: number;

  // ─── Animation Controls ───
  enableEntrance?: boolean;
  enableExitAnimation?: boolean;
  exitStartFrame?: number;
}

export const RssdLocationHeadline: React.FC<
  RssdLocationHeadlineProps & { item?: { props?: RssdLocationHeadlineProps } }
> = (rawProps) => {
  const props: RssdLocationHeadlineProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const safeFps = fps || 30;

  const sourceOnly = props.sourceOnly === true;

  // ─── 1. Location & Headline Defaults (Exact match to reference 1080x1920) ───
  const showLocation = sourceOnly ? false : props.showLocation !== false;
  const locationText = props.locationText ?? 'القاهرة';
  const locationColor = props.locationColor || '#ffffff';
  const locationFontSize = props.locationFontSize ?? 42;
  const locationIconSize = props.locationIconSize ?? 36;
  const locationGap = props.locationGap ?? 12;
  const locationBottomGap = props.locationBottomGap ?? 24;
  const locationRightIndent = props.locationRightIndent ?? 22;
  const locationOnly = props.locationOnly === true;

  const line1Text = props.line1Text ?? 'انقلاب سيارة على';
  const line2Text = props.line2Text ?? 'طريق مصر الصحراوي';
  const showHeadline = !sourceOnly && props.showHeadline !== false && Boolean(line1Text || line2Text);

  // ─── 2. Source Badge Defaults (Top-left @anas_habib at x=106, y=207, h=52) ───
  const sourceText = (props.sourceText ?? (sourceOnly ? '@anas_habib' : '')).trim();
  const showSource = props.showSource !== undefined ? Boolean(props.showSource && sourceText) : Boolean(sourceText);
  const sourceLeft = props.sourceLeft ?? 106;
  const sourceTop = props.sourceTop ?? 207;
  const sourceBgColor = props.sourceBgColor || '#000000';
  const sourceTextColor = props.sourceTextColor || '#ffffff';
  const sourceFontSize = props.sourceFontSize ?? 31;

  // ─── 3. Arabic Translation / Subtitle Defaults (Bottom-center at bottom=441, h=100) ───
  const subtitleRaw = (props.subtitleText ?? '').trim();
  const showSubtitle =
    props.showSubtitle !== undefined ? Boolean(props.showSubtitle && subtitleRaw) : Boolean(subtitleRaw);
  const subtitleBottom = props.subtitleBottom ?? 441;
  const subtitleBgColor = props.subtitleBgColor || 'rgba(0, 0, 0, 0.82)';
  const subtitleTextColor = props.subtitleTextColor || '#ffffff';
  const subtitleFontSize = props.subtitleFontSize ?? 44;

  // ─── 4. Brand Logo Defaults (Top-right ر ص د at right=134, top=502, 149x46) ───
  const showBrandLogo = props.showBrandLogo !== false;
  const logoTop = props.logoTop ?? 502;
  const logoRight = props.logoRight ?? 134;

  // ─── 5. Colors & Typography ───
  const accentColor = props.accentColor || '#1283F9';
  const line1BgColor = props.line1BgColor || '#ffffff';
  const line1TextColor = props.line1TextColor || '#000000';
  const line2BgColor = props.line2BgColor || accentColor;
  const line2TextColor = props.line2TextColor || '#ffffff';
  const backgroundColor = props.backgroundColor || 'transparent';
  const showAccentBlock = props.showAccentBlock === true;

  const fontFamily =
    props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, sans-serif";
  const fontSize = props.fontSize ?? 72;
  const fontWeight = props.fontWeight ?? 700;
  const boxPaddingX = props.boxPaddingX ?? 24;
  const boxPaddingY = props.boxPaddingY ?? 16;
  const gap = props.gap ?? 0;

  const line1Height = props.line1Height ?? props.boxHeight ?? 97;
  const line2Height = props.line2Height ?? props.boxHeight ?? 116;

  // Layout coordinates (exact 1080x1920 reference: rightOffset=238, bottomOffset=647)
  const isPortrait = height > width;
  const rightOffset =
    props.rightOffset !== undefined ? props.rightOffset : isPortrait ? 238 : 140;
  const bottomOffset =
    props.bottomOffset !== undefined ? props.bottomOffset : isPortrait ? 647 : 120;

  // Animation Timing: Headline stays for headlineDurationFrames (or clip durationInFrames) then exits,
  // while Source, Logo, and Subtitle stay for the full durationInFrames!
  const enableEntrance = props.enableEntrance !== false;
  const enableExitAnimation = props.enableExitAnimation !== false;
  const headlineDuration = props.headlineDurationFrames ?? durationInFrames;
  const exitStartFrame = props.exitStartFrame ?? Math.max(35, headlineDuration - 15);

  // ─── Location Entrance Animations ──────────────────────────────────────────
  const pinSpring = enableEntrance
    ? spring({
        frame: Math.max(0, frame - 4),
        fps: safeFps,
        config: { damping: 11, stiffness: 170, mass: 0.65 },
      })
    : 1;

  const pinOpacity = enableEntrance
    ? interpolate(frame, [4, 8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  const locTextProgress = enableEntrance
    ? interpolate(frame, [7, 21], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const locTextOpacity = enableEntrance
    ? interpolate(frame, [7, 14], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  // ─── Headline Entrance Animations ──────────────────────────────────────────
  const l1Progress = enableEntrance
    ? interpolate(frame, [3, 26], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const l2Progress = enableEntrance
    ? interpolate(frame, [10, 34], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const showL1Runner = enableEntrance && frame >= 4 && frame <= 22;
  const l1RunnerRightPercent = interpolate(frame, [4, 13, 22], [25, 92, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const l1RunnerBg =
    line1BgColor === '#ffffff' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.24)';

  const showL2Runner = enableEntrance && frame >= 11 && frame <= 32;
  const l2RunnerRightPx = interpolate(frame, [11, 22, 32], [110, 560, 580], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const l2RunnerWidthPx = interpolate(frame, [11, 22, 32], [140, 82, 80], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const l2RunnerBg = line2BgColor === '#ffffff' ? '#09345a' : line2BgColor;

  const showBottomTab = showAccentBlock && (!enableEntrance || frame >= 20);
  const bottomTabLeftPx = enableEntrance
    ? interpolate(
        frame,
        [20, 35, 50, Math.max(51, exitStartFrame)],
        [-285, -165, -60, 57],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      )
    : -60;
  const bottomTabWidthPx = enableEntrance
    ? interpolate(frame, [20, 30, 50], [10, 36, 55], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 55;

  // ─── Headline Outro Animation (Disappears after headlineDuration frames) ───
  let exitTranslateX = 0;
  let exitOpacity = 1;
  let silhouetteMix = 0;

  if (enableExitAnimation && frame >= exitStartFrame) {
    const pExit = interpolate(frame, [exitStartFrame, headlineDuration - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.35, 0, 0.25, 1),
    });

    exitTranslateX = interpolate(pExit, [0, 1], [0, -148]);
    silhouetteMix = interpolate(pExit, [0, 0.45], [0, 1], { extrapolateRight: 'clamp' });
    exitOpacity = interpolate(pExit, [0, 0.6, 0.8, 0.92, 1], [1, 0.9, 0.7, 0.35, 0], {
      extrapolateRight: 'clamp',
    });
  }
  if (enableExitAnimation && frame >= headlineDuration) {
    exitOpacity = 0;
  }

  const currentL1Bg =
    silhouetteMix > 0.65 ? '#e7e7e7' : silhouetteMix > 0.25 ? '#68b4fa' : line1BgColor;
  const currentL2Bg =
    silhouetteMix > 0.65 ? '#e7e7e7' : silhouetteMix > 0.25 ? '#68b4fa' : line2BgColor;
  const currentTabBg =
    silhouetteMix > 0.65 ? '#d0d0d0' : silhouetteMix > 0.25 ? '#68b4fa' : accentColor;
  const textOpacityDuringExit = interpolate(silhouetteMix, [0, 0.65], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── Source Badge Animation (MOGRT src wipe + runner block) ────────────────
  const srcProgress = enableEntrance
    ? interpolate(frame, [3, 19], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;
  const showSrcRunner = enableEntrance && frame >= 3 && frame <= 22;
  const srcRunnerProgress = interpolate(frame, [3, 14, 22], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── Subtitle / Translation Animation & Segment Cycling ────────────────────
  const subtitleSegments = subtitleRaw
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const segCount = Math.max(1, subtitleSegments.length);
  const framesPerSeg = durationInFrames / segCount;
  const currentSegIdx = Math.min(segCount - 1, Math.floor(frame / framesPerSeg));
  const currentSubtitleText = subtitleSegments[currentSegIdx] || subtitleRaw;
  const frameInSeg = frame - currentSegIdx * framesPerSeg;

  const subEntranceOpacity = enableEntrance
    ? interpolate(frameInSeg, [0, 8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;
  const subEntranceY = enableEntrance
    ? interpolate(frameInSeg, [0, 10], [10, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        backgroundColor,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <EmbeddedFonts />

      {/* ─── TOP-LEFT SOURCE BADGE (e.g. @anas_habib at x=106, y=207, h=52) ─── */}
      {showSource && (
        <div
          style={{
            position: 'absolute',
            top: sourceTop,
            left: sourceLeft,
            display: 'inline-flex',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          {/* MOGRT Small Two-Tone Top-Left Runner (المستطيل الصغير) during entrance */}
          {showSrcRunner && (
            <div
              style={{
                position: 'absolute',
                top: -14,
                left: 0,
                display: 'flex',
                flexDirection: 'row',
                opacity: srcRunnerProgress,
              }}
            >
              <div style={{ width: 32, height: 11, backgroundColor: '#555555' }} />
              <div style={{ width: 32, height: 11, backgroundColor: accentColor }} />
            </div>
          )}

          <div
            style={{
              backgroundColor: sourceBgColor,
              height: 52,
              padding: '0 18px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              clipPath: `inset(0 ${100 - srcProgress * 100}% 0 0)`,
            }}
          >
            <span
              style={{
                color: sourceTextColor,
                fontFamily: "'Suiza', 'Geist', 'Ghroob Arabic itf', GhroobArabic, sans-serif",
                fontSize: sourceFontSize,
                fontWeight: 500,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                direction: /^[\u0600-\u06FF]/.test(sourceText) ? 'rtl' : 'ltr',
                transform: 'translateY(-1px)',
              }}
            >
              {sourceText}
            </span>
          </div>
        </div>
      )}

      {/* ─── TOP-RIGHT RASD BRAND LOGO (ر ص د at right=134, top=502, 149x46) ─── */}
      {showBrandLogo && (
        <div
          style={{
            position: 'absolute',
            top: logoTop,
            right: logoRight,
            width: 149,
            height: 46,
            zIndex: 10,
            filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))',
          }}
        >
          <img
            src={RASD_LOGO_DATA_URI}
            alt="Rasd"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* ─── CENTER-RIGHT LOCATION PIN & 2-LINE HEADLINE STRIPS ─── */}
      {exitOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            ...(props.bottomOffset !== undefined || props.topOffset === undefined
              ? { bottom: bottomOffset }
              : { top: props.topOffset }),
            right: rightOffset,
            transform: `translateX(${exitTranslateX}px)`,
            opacity: exitOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            direction: 'rtl',
            fontFamily,
            zIndex: 15,
          }}
        >
          {/* ─── LOCATION BADGE (UP) ─── */}
          {showLocation && locationText && (
            <div
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: locationGap,
                marginBottom: locationBottomGap,
                marginRight: locationRightIndent,
                direction: 'rtl',
              }}
            >
              <LocationPinIcon
                size={locationIconSize}
                color={locationColor}
                style={{
                  transform: `scale(${pinSpring})`,
                  opacity: pinOpacity,
                }}
              />
              <span
                style={{
                  color: locationColor,
                  fontSize: locationFontSize,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                  clipPath: `inset(0 0 0 ${100 - locTextProgress * 100}%)`,
                  opacity: locTextOpacity * textOpacityDuringExit,
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.85)',
                }}
              >
                {locationText}
              </span>
            </div>
          )}

          {!locationOnly && showHeadline && (
            <>
              {/* ─── LINE 1: TOP HEADLINE BOX (White Box, h=97px, 24px/16px padding) ─── */}
              {line1Text && (
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginBottom: gap,
                  }}
                >
                  {showL1Runner && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        right: `${l1RunnerRightPercent}%`,
                        width: 84,
                        height: 44,
                        backgroundColor: l1RunnerBg,
                        transform: 'translateX(35%)',
                        zIndex: 3,
                      }}
                    />
                  )}

                  <div
                    style={{
                      position: 'relative',
                      backgroundColor: currentL1Bg,
                      padding: `${boxPaddingY}px ${boxPaddingX}px`,
                      height: line1Height,
                      boxSizing: 'border-box',
                      clipPath: `inset(0 0 0 ${100 - l1Progress * 100}%)`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        color: line1TextColor,
                        fontSize,
                        fontWeight,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        opacity: textOpacityDuringExit,
                        transform: 'translateY(-3px)',
                      }}
                    >
                      {line1Text}
                    </span>
                  </div>
                </div>
              )}

              {/* ─── LINE 2: BOTTOM HEADLINE BOX (Blue Box, h=116px, 0px gap) ─── */}
              {line2Text && (
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {showL2Runner && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 32,
                        right: l2RunnerRightPx,
                        width: l2RunnerWidthPx,
                        height: 44,
                        backgroundColor: l2RunnerBg,
                        zIndex: 1,
                        opacity: 0.95,
                      }}
                    />
                  )}

                  <div
                    style={{
                      position: 'relative',
                      backgroundColor: currentL2Bg,
                      padding: `${boxPaddingY}px ${boxPaddingX}px`,
                      height: line2Height,
                      boxSizing: 'border-box',
                      clipPath: `inset(0 0 0 ${100 - l2Progress * 100}%)`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        color: line2TextColor,
                        fontSize,
                        fontWeight,
                        lineHeight: 1.1,
                        whiteSpace: 'nowrap',
                        opacity: textOpacityDuringExit,
                        transform: 'translateY(-3px)',
                      }}
                    >
                      {line2Text}
                    </span>
                  </div>

                  {showBottomTab && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -24,
                        left: bottomTabLeftPx,
                        width: bottomTabWidthPx,
                        height: 24,
                        backgroundColor: currentTabBg,
                        zIndex: 3,
                      }}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── BOTTOM-CENTER ARABIC TRANSLATION / SUBTITLE BOX (bottom=441, h=100) ─── */}
      {showSubtitle && currentSubtitleText && (
        <div
          style={{
            position: 'absolute',
            top: props.subtitleTop ?? Math.round(height * (1380 / 1920)),
            left: '50%',
            transform: `translateX(-50%) translateY(${subEntranceY}px)`,
            opacity: subEntranceOpacity,
            backgroundColor: subtitleBgColor,
            minWidth: 430,
            maxWidth: 920,
            minHeight: 98,
            padding: '18px 48px',
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            direction: 'rtl',
            fontFamily,
            zIndex: 12,
          }}
        >
          <span
            style={{
              color: subtitleTextColor,
              fontSize: subtitleFontSize,
              fontWeight: 500,
              lineHeight: 1.35,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              transform: 'translateY(-2px)',
            }}
          >
            {currentSubtitleText}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Standalone RssdLocation component for convenience when only the location badge is needed.
 */
export const RssdLocation: React.FC<
  RssdLocationHeadlineProps & { item?: { props?: RssdLocationHeadlineProps } }
> = (props) => <RssdLocationHeadline {...props} locationOnly />;
