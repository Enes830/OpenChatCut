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
  // Aspect ratio is 26 : 34 (approx 1 : 1.3)
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
  // ─── Location Badge Props (extracted from Rssd - Date & Loc & Src.mogrt) ───
  showLocation?: boolean;
  locationText?: string;
  locationColor?: string;
  locationFontSize?: number;
  locationIconSize?: number;
  locationGap?: number;
  locationBottomGap?: number;

  // ─── Headline Text Content (matching WhatsApp reference photo) ───
  line1Text?: string;
  line2Text?: string;
  line3Text?: string;
  lineCount?: 1 | 2 | 3;

  // ─── Colors & Styling ───
  line1BgColor?: string;
  line1TextColor?: string;
  line2BgColor?: string;
  line2TextColor?: string;
  line3BgColor?: string;
  line3TextColor?: string;
  backgroundColor?: string;

  // ─── Typography ───
  fontFamily?: string;
  line1FontSize?: number;
  line2FontSize?: number;
  line3FontSize?: number;
  fontWeight?: number | string;

  // ─── Layout & Exact WhatsApp Photo Coordinates ───
  // Default values calibrated to 1080x1920 (scaled 1.2x from 900x1600 reference)
  bottomOffset?: number; // px from bottom of composition (default: 648px)
  rightOffset?: number; // px from right edge of composition (default: 238px)
  boxPaddingX?: number; // horizontal padding inside boxes (default: 34px)
  boxPaddingY?: number; // vertical padding inside boxes (default: 14px)
  boxHeight1?: number; // Line 1 box height (default: 110px)
  boxHeight2?: number; // Line 2 box height (default: 118px)
  boxHeight3?: number; // Line 3 box height (default: 118px)
  gap?: number; // vertical gap between headline boxes (default: 10px)

  // ─── Animation Controls (reused from Rssd suite) ───
  enableEntrance?: boolean;
  enableRunners?: boolean;
  enableExitGlitch?: boolean;
  exitStartFrame?: number;
  locationOnly?: boolean; // render only the location badge if true
}

export const RssdLocationHeadline: React.FC<
  RssdLocationHeadlineProps & { item?: { props?: RssdLocationHeadlineProps } }
> = (rawProps) => {
  const props: RssdLocationHeadlineProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const safeFps = fps || 30;

  // ─── Text Content Defaults (Exact WhatsApp Photo Reference) ───
  const showLocation = props.showLocation !== false;
  const locationText = props.locationText ?? 'القاهرة';
  const locationColor = props.locationColor || '#ffffff';
  const locationFontSize = props.locationFontSize ?? 42;
  const locationIconSize = props.locationIconSize ?? 36;
  const locationGap = props.locationGap ?? 12;
  const locationBottomGap = props.locationBottomGap ?? 22;

  const lineCount = props.lineCount ?? 2;
  const line1Text = props.line1Text ?? 'انقلاب سيارة على';
  const line2Text = props.line2Text ?? 'طريق مصر الصحراوي';
  const line3Text = props.line3Text ?? '';

  // ─── Colors (WhatsApp Photo Reference) ───
  // Line 1: Solid White background with pure black bold text
  const line1BgColor = props.line1BgColor || '#ffffff';
  const line1TextColor = props.line1TextColor || '#000000';

  // Line 2: Signature Rasd Vibrant Blue (#1283F9) with white bold text
  const line2BgColor = props.line2BgColor || '#1283F9';
  const line2TextColor = props.line2TextColor || '#ffffff';

  const line3BgColor = props.line3BgColor || '#1283F9';
  const line3TextColor = props.line3TextColor || '#ffffff';
  const backgroundColor = props.backgroundColor || 'transparent';

  // ─── Typography & Coordinates matching WhatsApp Reference ───
  const fontFamily =
    props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, sans-serif";
  const line1FontSize = props.line1FontSize ?? 74;
  const line2FontSize = props.line2FontSize ?? 80;
  const line3FontSize = props.line3FontSize ?? 74;
  const fontWeight = props.fontWeight ?? 700;

  const boxPaddingX = props.boxPaddingX ?? 34;
  const boxPaddingY = props.boxPaddingY ?? 14;
  const boxHeight1 = props.boxHeight1 ?? 110;
  const boxHeight2 = props.boxHeight2 ?? 118;
  const boxHeight3 = props.boxHeight3 ?? 118;
  const gap = props.gap ?? 10;

  // Adaptive coordinate defaults:
  // - Portrait (1080x1920): WhatsApp photo layout (right: 238px, bottom: 648px)
  // - Landscape (1920x1080): Broadcast lower-third layout (right: 140px, bottom: 120px)
  const isPortrait = height > width;
  const defaultRightOffset = isPortrait ? 238 : 140;
  const defaultBottomOffset = isPortrait ? 648 : 120;
  const rightOffset = props.rightOffset !== undefined ? props.rightOffset : defaultRightOffset;
  const bottomOffset = props.bottomOffset !== undefined ? props.bottomOffset : defaultBottomOffset;

  const enableEntrance = props.enableEntrance !== false;
  const enableRunners = props.enableRunners !== false;
  const enableExitGlitch = props.enableExitGlitch !== false;
  const exitStartFrame = props.exitStartFrame ?? Math.max(35, durationInFrames - 15);
  const locationOnly = props.locationOnly === true;

  // ─── 1. Location Pin & Text Animation (from Rssd - Date & Loc & Src.mogrt) ─
  // In the MOGRT, pin pops in at frame 4 with elastic overshoot bounce
  const pinSpring = enableEntrance
    ? spring({
        frame: Math.max(0, frame - 4),
        fps: safeFps,
        config: { damping: 11, stiffness: 170, mass: 0.65 },
      })
    : 1;

  // Pin opacity: quick fade in during initial pop
  const pinOpacity = enableEntrance
    ? interpolate(frame, [4, 8], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  // Location text wipes in smoothly from right to left (frames 7 to 20)
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

  // ─── 2. Headline Boxes RTL Wipe Entrance (from RssdText & MOGRT) ──────────
  const l1Progress = enableEntrance
    ? interpolate(frame, [6, 28], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const l2Progress = enableEntrance
    ? interpolate(frame, [14, 34], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const l3Progress = enableEntrance
    ? interpolate(frame, [20, 40], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  // ─── 3. Detached Leading Runner Blocks ─────────────────────────────────────
  // Detached white runner block ahead of Line 1 (frames 5 to 25)
  const showL1Runner = enableEntrance && enableRunners && frame >= 5 && frame <= 24;
  const l1RunnerRightPx = interpolate(frame, [5, 18, 24], [25, 480, 520], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Detached blue runner block ahead of Line 2 (frames 13 to 32)
  const showL2Runner = enableEntrance && enableRunners && frame >= 13 && frame <= 32;
  const l2RunnerRightPx = interpolate(frame, [13, 24, 32], [30, 560, 610], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ─── 4. Outro Strobe & Stepped Cut (reused from Rssd broadcast style) ──────
  let exitOpacityL1 = 1;
  let exitOpacityL2 = 1;
  let exitOpacityL3 = 1;
  let exitOpacityLoc = 1;

  if (enableExitGlitch && frame >= exitStartFrame) {
    const fRel = frame - exitStartFrame;
    const locStrobe = [1, 0.85, 0.5, 0.4, 0.15, 0];
    const l1Strobe = [1, 0.85, 0.65, 0.72, 0.48, 0.43, 0.39, 0];
    const l2Strobe = [1, 1, 1, 1, 1, 0.92, 0.76, 0.71, 0.51, 0.4, 0.41, 0.08, 0];
    const l3Strobe = [1, 1, 1, 0.85, 0.6, 0.4, 0.2, 0];

    exitOpacityLoc = locStrobe[Math.min(fRel, locStrobe.length - 1)];
    exitOpacityL1 = l1Strobe[Math.min(fRel, l1Strobe.length - 1)];
    exitOpacityL2 = l2Strobe[Math.min(fRel, l2Strobe.length - 1)];
    exitOpacityL3 = l3Strobe[Math.min(fRel, l3Strobe.length - 1)];
  }

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

      {/* Main Container positioned at exact WhatsApp photo lower-third coordinates */}
      <div
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          right: rightOffset,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start', // RTL: flex-start pins right edges flush
          direction: 'rtl',
          fontFamily,
        }}
      >
        {/* ─── 1. LOCATION BADGE (White Pin + Cairo text, NO background boxes) ─── */}
        {showLocation && (
          <div
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              flexDirection: 'row',
              marginBottom: locationOnly ? 0 : locationBottomGap,
              opacity: exitOpacityLoc,
              zIndex: 10,
              paddingRight: 4, // slight optical alignment with headline box edge
            }}
          >
            {/* Animated Pin Icon (Overshoot pop-in from Mogrt) */}
            <div
              style={{
                transform: `scale(${pinSpring})`,
                transformOrigin: 'bottom center',
                opacity: pinOpacity,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LocationPinIcon size={locationIconSize} color={locationColor} />
            </div>

            {/* Location Text with RTL reveal wipe */}
            <div
              style={{
                marginRight: locationGap,
                clipPath: `inset(0 0 0 ${100 - locTextProgress * 100}%)`,
                opacity: locTextOpacity,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  color: locationColor,
                  fontSize: locationFontSize,
                  fontWeight: 700,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  textShadow:
                    '0 2px 8px rgba(0, 0, 0, 0.8), 0 1px 3px rgba(0, 0, 0, 0.95)',
                }}
              >
                {locationText}
              </span>
            </div>
          </div>
        )}

        {/* ─── 2. HEADLINE BOXES (WhatsApp Photo Layout) ─── */}
        {!locationOnly && (
          <>
            {/* ── LINE 1: TOP WHITE BOX (Black Text) ── */}
            <div
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                opacity: exitOpacityL1,
                marginBottom: lineCount >= 2 ? gap : 0,
              }}
            >
              {/* Detached Runner Block */}
              {showL1Runner && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: l1RunnerRightPx,
                    width: 70,
                    height: 42,
                    backgroundColor: line1BgColor,
                    zIndex: 1,
                    opacity: 0.9,
                  }}
                />
              )}

              {/* White Headline Box */}
              <div
                style={{
                  position: 'relative',
                  backgroundColor: line1BgColor,
                  padding: `${boxPaddingY}px ${boxPaddingX}px`,
                  minHeight: boxHeight1,
                  boxSizing: 'border-box',
                  clipPath: `inset(0 0 0 ${100 - l1Progress * 100}%)`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  zIndex: 2,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                }}
              >
                <span
                  style={{
                    color: line1TextColor,
                    fontSize: line1FontSize,
                    fontWeight,
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                    transform: 'translateY(-2px)',
                  }}
                >
                  {line1Text}
                </span>
              </div>
            </div>

            {/* ── LINE 2: SECONDARY BLUE ACCENT BOX (White Text) ── */}
            {lineCount >= 2 && (
              <div
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: exitOpacityL2,
                  marginBottom: lineCount >= 3 ? gap : 0,
                }}
              >
                {/* Detached Blue Runner Block */}
                {showL2Runner && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: l2RunnerRightPx,
                      width: 90,
                      height: 44,
                      backgroundColor: line2BgColor,
                      zIndex: 1,
                      opacity: 0.95,
                    }}
                  />
                )}

                {/* Blue Headline Box */}
                <div
                  style={{
                    position: 'relative',
                    backgroundColor: line2BgColor,
                    padding: `${boxPaddingY}px ${boxPaddingX}px`,
                    minHeight: boxHeight2,
                    boxSizing: 'border-box',
                    clipPath: `inset(0 0 0 ${100 - l2Progress * 100}%)`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    zIndex: 2,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <span
                    style={{
                      color: line2TextColor,
                      fontSize: line2FontSize,
                      fontWeight,
                      lineHeight: 1.1,
                      whiteSpace: 'nowrap',
                      transform: 'translateY(-2px)',
                    }}
                  >
                    {line2Text}
                  </span>
                </div>
              </div>
            )}

            {/* ── LINE 3: OPTIONAL THIRD BOX ── */}
            {lineCount >= 3 && line3Text && (
              <div
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  opacity: exitOpacityL3,
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    backgroundColor: line3BgColor,
                    padding: `${boxPaddingY}px ${boxPaddingX}px`,
                    minHeight: boxHeight3,
                    boxSizing: 'border-box',
                    clipPath: `inset(0 0 0 ${100 - l3Progress * 100}%)`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    zIndex: 2,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <span
                    style={{
                      color: line3TextColor,
                      fontSize: line3FontSize,
                      fontWeight,
                      lineHeight: 1.1,
                      whiteSpace: 'nowrap',
                      transform: 'translateY(-2px)',
                    }}
                  >
                    {line3Text}
                  </span>
                </div>
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
> = (props) => {
  return <RssdLocationHeadline {...props} locationOnly={true} />;
};
