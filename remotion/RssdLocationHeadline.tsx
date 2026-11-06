import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { EmbeddedFonts } from './embeddedFonts';

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
  locationOnly?: boolean;

  // ─── Text Content ───
  line1Text?: string;
  line2Text?: string;

  // ─── Colors & Themes ───
  accentColor?: string; // Brand Blue (#0080F8 / #1283F9)
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
  const safeFps = fps || 25;

  // Content defaults matching reference video & layout
  const showLocation = props.showLocation !== false;
  const locationText = props.locationText ?? 'القاهرة';
  const locationColor = props.locationColor || '#ffffff';
  const locationFontSize = props.locationFontSize ?? 42;
  const locationIconSize = props.locationIconSize ?? 36;
  const locationGap = props.locationGap ?? 12;
  const locationBottomGap = props.locationBottomGap ?? 18;
  const locationOnly = props.locationOnly === true;

  const line1Text = props.line1Text ?? 'انقلاب سيارة على';
  const line2Text = props.line2Text ?? 'طريق مصر الصحراوي';

  // Colors (matching WhatsApp broadcast reference + RssdRaw palette)
  const accentColor = props.accentColor || '#1283F9';
  const line1BgColor = props.line1BgColor || '#ffffff';
  const line1TextColor = props.line1TextColor || '#000000';
  const line2BgColor = props.line2BgColor || accentColor;
  const line2TextColor = props.line2TextColor || '#ffffff';
  const backgroundColor = props.backgroundColor || 'transparent';
  const showAccentBlock = props.showAccentBlock !== false;

  // Typography & Layout matching RssdRaw (box height 144px, fontSize 95px)
  const fontFamily =
    props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, sans-serif";
  const fontSize = props.fontSize ?? 95;
  const fontWeight = props.fontWeight ?? 700;
  const boxPaddingX = props.boxPaddingX ?? 44;
  const boxPaddingY = props.boxPaddingY ?? 18;
  const gap = props.gap ?? 17;

  // Layout coordinates (adaptive to portrait 9:16 vs landscape 16:9)
  const isPortrait = height > width;
  const rightOffset =
    props.rightOffset !== undefined ? props.rightOffset : isPortrait ? 238 : 140;
  const bottomOffset =
    props.bottomOffset !== undefined ? props.bottomOffset : isPortrait ? 648 : 120;

  // Animation Timing (identical to RssdRaw)
  const enableEntrance = props.enableEntrance !== false;
  const enableExitAnimation = props.enableExitAnimation !== false;
  const exitStartFrame = props.exitStartFrame ?? Math.max(40, durationInFrames - 12);

  // ─── 0. Location Entrance Animations (Pin pop + RTL text wipe) ──────────────
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

  // ─── 1. Headline Entrance Animations (Frames 3 – 38, Identical to RssdRaw) ───
  const l1Progress = enableEntrance
    ? interpolate(frame, [3, 28], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const l2Progress = enableEntrance
    ? interpolate(frame, [11, 36], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  // Translucent leading runner block for Line 1 (frames 4 to 24)
  const showL1Runner = enableEntrance && frame >= 4 && frame <= 24;
  const l1RunnerRightPercent = interpolate(frame, [4, 14, 24], [25, 92, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const l1RunnerBg =
    line1BgColor === '#ffffff' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.24)';

  // Detached runner block ahead of Line 2 (frames 12 to 36)
  const showL2Runner = enableEntrance && frame >= 12 && frame <= 36;
  const l2RunnerRightPx = interpolate(frame, [12, 24, 36], [110, 686, 686], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const l2RunnerWidthPx = interpolate(frame, [12, 24, 36], [150, 88, 87], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const l2RunnerBg = line2BgColor === '#ffffff' ? '#09345a' : line2BgColor;

  // Bottom-left blue accent tab that glides horizontally
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

  // ─── 2. Outro Animation (Leftward Slide -148px + Silhouette Fade, Identical to RssdRaw) ─
  let exitTranslateX = 0;
  let exitOpacity = 1;
  let silhouetteMix = 0;

  if (enableExitAnimation && frame >= exitStartFrame) {
    const pExit = interpolate(frame, [exitStartFrame, durationInFrames - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.35, 0, 0.25, 1),
    });

    exitTranslateX = interpolate(pExit, [0, 1], [0, -148]);
    silhouetteMix = interpolate(pExit, [0, 0.45], [0, 1], { extrapolateRight: 'clamp' });
    exitOpacity = interpolate(pExit, [0, 0.6, 0.8, 0.92, 1], [1, 0.9, 0.7, 0.37, 0]);
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

        {!locationOnly && (
          <>
            {/* ─── LINE 1: TOP HEADLINE BOX (Identical structure to RssdRaw) ─── */}
            <div
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                marginBottom: gap,
              }}
            >
              {/* Translucent Leading Runner Block */}
              {showL1Runner && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    right: `${l1RunnerRightPercent}%`,
                    width: 84,
                    height: 52,
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
                  height: 144,
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

            {/* ─── LINE 2: BOTTOM HEADLINE BOX + SLIDING ACCENT TAB (Identical structure to RssdRaw) ─── */}
            {line2Text && (
              <div
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {/* Detached Runner Block on Left */}
                {showL2Runner && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 60,
                      right: l2RunnerRightPx,
                      width: l2RunnerWidthPx,
                      height: 52,
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
                    height: 144,
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

                {/* Bottom-left small blue accent tab that glides horizontally */}
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
    </div>
  );
};

/**
 * Standalone RssdLocation component for convenience when only the location badge is needed.
 */
export const RssdLocation: React.FC<
  RssdLocationHeadlineProps & { item?: { props?: RssdLocationHeadlineProps } }
> = (props) => <RssdLocationHeadline {...props} locationOnly />;
