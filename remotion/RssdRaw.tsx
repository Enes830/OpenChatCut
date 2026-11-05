import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { EmbeddedFonts } from './embeddedFonts';

export interface RssdRawProps {
  // Text content
  line1Text?: string;
  line2Text?: string;

  // Colors & Themes
  accentColor?: string; // Brand Blue (#0080F8), Red (#f22d2d), Teal (#00b8a7)
  line1TextColor?: string;
  line2TextColor?: string;
  line2BgColor?: string;
  backgroundColor?: string;
  showAccentBlock?: boolean;

  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;

  // Layout & Positioning
  topOffset?: number; // px from top of composition (default 684 in 1440 canvas)
  rightOffset?: number; // px from right edge of composition (default 137 -> x2=943 in 1080 canvas)
  boxPaddingX?: number;
  boxPaddingY?: number;
  gap?: number;

  // Animation Controls
  enableEntrance?: boolean;
  enableExitAnimation?: boolean;
  exitStartFrame?: number;
}

export const RssdRaw: React.FC<RssdRawProps & { item?: { props?: RssdRawProps } }> = (rawProps) => {
  const props: RssdRawProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();

  // Content defaults from rasd/raw.mp4
  const line1Text = props.line1Text ?? 'القضية الفلسطينية';
  const line2Text = props.line2Text ?? 'روهات رصد';

  // Colors
  const accentColor = props.accentColor || '#0080F8';
  const line1TextColor = props.line1TextColor || '#ffffff';
  const line2TextColor = props.line2TextColor || '#000000';
  const line2BgColor = props.line2BgColor || '#ffffff';
  const backgroundColor = props.backgroundColor || 'transparent';
  const showAccentBlock = props.showAccentBlock !== false;

  // Typography & Layout matching rasd/raw.mp4 (right-aligned at x2=943, y1=684..827, y2=844..987)
  const fontFamily =
    props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, sans-serif";
  const fontSize = props.fontSize ?? 95;
  const fontWeight = props.fontWeight ?? 700;
  const boxPaddingX = props.boxPaddingX ?? 44;
  const boxPaddingY = props.boxPaddingY ?? 18;
  const gap = props.gap ?? 17;
  const topOffset = props.topOffset ?? 684;
  const rightOffset = props.rightOffset ?? 137;

  // Animation Timing
  const enableEntrance = props.enableEntrance !== false;
  const enableExitAnimation = props.enableExitAnimation !== false;
  const exitStartFrame = props.exitStartFrame ?? Math.max(40, durationInFrames - 12);

  // ─── 1. Entrance Animations (Frames 3 – 38) ─────────────────────────────────
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

  // Translucent grey runner block leading Line 1 wipe (frames 4 to 24)
  const showL1Runner = enableEntrance && frame >= 4 && frame <= 24;
  const l1RunnerRightPercent = interpolate(frame, [4, 14, 24], [25, 92, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Detached dark-blue runner block ahead of Line 2 (frames 12 to 36)
  // Shoots out to x=170..257 (686px to the left of x2=943)
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

  // Bottom-left blue accent tab (y: 988..1011, height: 24px, width: 55px)
  // Anchored relative to Line 2's left edge: starts at left=-285px at f20, reaches left=-60px
  // (just outside Line 2's bottom-left corner, x=388..443) at f50, then glides rightward to left=+57px by f138!
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

  // ─── 2. Outro Animation (Leftward Slide -148px + White/Grey Silhouette Fade) ─
  // Matches rasd/raw.mp4 frames 138..148: slides left by 148px while turning into a uniform
  // light-grey silhouette (#e7e7e7) and fading out to 0 by frame 149.
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
    silhouetteMix > 0.65 ? '#e7e7e7' : silhouetteMix > 0.25 ? '#68b4fa' : accentColor;
  const currentL2Bg = silhouetteMix > 0.65 ? '#e7e7e7' : line2BgColor;
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
          top: topOffset,
          right: rightOffset,
          transform: `translateX(${exitTranslateX}px)`,
          opacity: exitOpacity,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start', // In RTL flex container, flex-start aligns right edges flush at x2=943
          direction: 'rtl',
          fontFamily,
        }}
      >
        {/* ─── LINE 1: TOP ACCENT BOX ─── */}
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            marginBottom: gap,
          }}
        >
          {/* Translucent Grey Leading Runner Block */}
          {showL1Runner && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                right: `${l1RunnerRightPercent}%`,
                width: 84,
                height: 52,
                backgroundColor: 'rgba(255, 255, 255, 0.24)',
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

        {/* ─── LINE 2: BOTTOM WHITE BOX + SLIDING ACCENT TAB ─── */}
        <div
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {/* Detached Dark-Blue Runner Block on Left */}
          {showL2Runner && (
            <div
              style={{
                position: 'absolute',
                top: 60,
                right: l2RunnerRightPx,
                width: l2RunnerWidthPx,
                height: 52,
                backgroundColor: '#09345a',
                zIndex: 1,
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
      </div>
    </div>
  );
};
