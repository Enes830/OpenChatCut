import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface ArabicBlueNewsBoxesProps {
  // Text content
  line1Text?: string;
  line2Text?: string;
  line3Text?: string;

  // Colors
  line1BgColor?: string;
  line1TextColor?: string;
  line2BgColor?: string;
  line2TextColor?: string;
  line3BgColor?: string;
  line3TextColor?: string;

  // Sliding Accent Runner Tab (the animated white box on top of the blue banner)
  showAccentTab?: boolean;
  accentTabColor?: string;
  tabWidth?: number;
  tabHeight?: number;
  runnerSpeed?: number; // pixels moved per frame to the left
  tabStartDelay?: number; // frames after entrance delay before tab appears

  // Typography
  fontFamily?: string;
  fontSize?: number;

  // Layout & Styling
  yOffsetPercent?: number; // 0 - 100 (% from top)
  borderRadius?: number;
  gap?: number;
  showShadow?: boolean;
  align?: 'right' | 'center' | 'left';
  rightMargin?: number;

  // Animation timing
  entranceDelay?: number; // frames before entrance begins
  staggerDelay?: number; // stagger frames between lines
  enableExitAnimation?: boolean; // whether boxes fade out at the end
  exitDelayFrames?: number; // frame at which exit fade starts
  exitStaggerDelay?: number; // stagger frames between lines on exit
}

export const ArabicBlueNewsBoxes: React.FC<{
  item?: {
    props?: ArabicBlueNewsBoxesProps;
    width?: number;
    height?: number;
    durationInFrames?: number;
  };
}> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: compositionDuration } = useVideoConfig();
  const safeFps = fps || 30;

  const props = item?.props || {};

  // Content defaults from Sequence 03.mp4
  const line1Text = props.line1Text ?? 'أحد رجال مبارك';
  const line2Text = props.line2Text ?? 'ومن أشد المعادين';
  const line3Text = props.line3Text ?? 'للرئيس الراحل محمد مرسي';

  // Colors & Visual Styling
  const line1BgColor = props.line1BgColor || '#0f83f3';
  const line1TextColor = props.line1TextColor || '#ffffff';
  const line2BgColor = props.line2BgColor || '#ffffff';
  const line2TextColor = props.line2TextColor || '#111111';
  const line3BgColor = props.line3BgColor || '#ffffff';
  const line3TextColor = props.line3TextColor || '#111111';

  // Sliding Accent Runner Tab defaults
  const showAccentTab = props.showAccentTab !== false;
  const accentTabColor = props.accentTabColor || '#ffffff';
  const tabWidth = Number(props.tabWidth ?? 38);
  const tabHeight = Number(props.tabHeight ?? 15);
  const runnerSpeed = Number(props.runnerSpeed ?? 1.85);
  const tabStartDelay = Number(props.tabStartDelay ?? 22);

  const fontFamily = props.fontFamily || 'GhroobArabic, "Noto Sans Arabic", Cairo, "IBM Plex Sans Arabic", sans-serif';
  const fontSize = Number(props.fontSize) || 54;
  const yOffsetPercent = Number(props.yOffsetPercent ?? 28);
  const borderRadius = Number(props.borderRadius ?? 2);
  const gap = Number(props.gap ?? 16);
  const rightMargin = Number(props.rightMargin ?? 48);
  const showShadow = props.showShadow !== false;
  const align = props.align || 'right';

  // Animation timing
  const entranceDelay = Number(props.entranceDelay ?? 0);
  const staggerDelay = Number(props.staggerDelay ?? 8);
  const enableExitAnimation = props.enableExitAnimation !== false;

  // Default exit begins ~24 frames before the clip ends if not explicitly specified
  const effectiveDuration = item?.durationInFrames || compositionDuration || 140;
  const exitDelayFrames = Number(props.exitDelayFrames ?? Math.max(entranceDelay + 40, effectiveDuration - 25));
  const exitStaggerDelay = Number(props.exitStaggerDelay ?? 6);
  const exitFadeDuration = 8;

  // Reference canvas (1080x1080 square reference from Sequence 03.mp4)
  const DESIGN_WIDTH = 1080;
  const DESIGN_HEIGHT = 1080;
  const scale = Math.min(
    (item?.width || DESIGN_WIDTH) / DESIGN_WIDTH,
    (item?.height || DESIGN_HEIGHT) / DESIGN_HEIGHT
  );

  // ── ENTRANCE ANIMATION (Right-to-Left Wipe Reveal) ──
  // Line 1 (Blue Box)
  const line1Spring = spring({
    frame: Math.max(0, frame - entranceDelay),
    fps: safeFps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });

  // Line 2 (White Box 1)
  const line2Spring = spring({
    frame: Math.max(0, frame - (entranceDelay + staggerDelay)),
    fps: safeFps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });

  // Line 3 (White Box 2)
  const line3Spring = spring({
    frame: Math.max(0, frame - (entranceDelay + staggerDelay * 2)),
    fps: safeFps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });

  // RTL wipe calculations:
  // As spring moves 0 -> 1, left clipping inset goes 100% -> 0%
  // This smoothly reveals each box from right to left while keeping right edge fixed.
  const line1ClipLeft = Math.max(0, Math.min(100, (1 - line1Spring) * 100));
  const line2ClipLeft = Math.max(0, Math.min(100, (1 - line2Spring) * 100));
  const line3ClipLeft = Math.max(0, Math.min(100, (1 - line3Spring) * 100));

  // Entrance opacities
  const line1EntranceOpacity = interpolate(line1Spring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
  const line2EntranceOpacity = interpolate(line2Spring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
  const line3EntranceOpacity = interpolate(line3Spring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });

  // ── SLIDING ACCENT RUNNER TAB DYNAMICS ──
  // Appears after Line 1 finishes wiping open (~frame 22), then glides steadily leftward along the top border
  const tabStartFrame = entranceDelay + tabStartDelay;
  const isTabActive = frame >= tabStartFrame;
  const tabSlideOffset = Math.max(0, (frame - tabStartFrame) * runnerSpeed);
  const tabInitialRight = 10; // initial offset from the right edge
  const tabRightPos = tabInitialRight + tabSlideOffset;

  const tabEntranceOpacity = isTabActive
    ? interpolate(frame, [tabStartFrame, tabStartFrame + 4], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  // ── EXIT ANIMATION (Staggered Fade Out) ──
  const line1ExitOpacity = enableExitAnimation
    ? interpolate(frame, [exitDelayFrames, exitDelayFrames + exitFadeDuration], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  const line2ExitOpacity = enableExitAnimation
    ? interpolate(
        frame,
        [exitDelayFrames + exitStaggerDelay, exitDelayFrames + exitStaggerDelay + exitFadeDuration],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 1;

  const line3ExitOpacity = enableExitAnimation
    ? interpolate(
        frame,
        [exitDelayFrames + exitStaggerDelay * 2, exitDelayFrames + exitStaggerDelay * 2 + exitFadeDuration],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : 1;

  const line1FinalOpacity = line1EntranceOpacity * line1ExitOpacity;
  const line2FinalOpacity = line2EntranceOpacity * line2ExitOpacity;
  const line3FinalOpacity = line3EntranceOpacity * line3ExitOpacity;
  const tabFinalOpacity = tabEntranceOpacity * line1ExitOpacity;

  const shadowStyle = showShadow
    ? {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.14)',
      }
    : {};

  const containerAlignStyle: React.CSSProperties =
    align === 'right'
      ? { alignItems: 'flex-end', paddingRight: `${rightMargin}px` }
      : align === 'left'
      ? { alignItems: 'flex-start', paddingLeft: `${rightMargin}px` }
      : { alignItems: 'center' };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
        overflow: 'hidden',
        fontFamily,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: `${yOffsetPercent}%`,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: `${gap}px`,
          ...containerAlignStyle,
          direction: 'rtl',
        }}
      >
        {/* Line 1: Primary Lead Box (Vivid Blue) with Animated Sliding Tab */}
        {line1Text.trim() && (
          <div
            style={{
              position: 'relative',
              opacity: line1FinalOpacity,
            }}
          >
            {/* Sliding White Runner Accent Tab on Top Border (as seen in Sequence 03.mp4) */}
            {showAccentTab && isTabActive && (
              <div
                style={{
                  position: 'absolute',
                  top: `-${tabHeight}px`,
                  right: `${tabRightPos.toFixed(1)}px`,
                  width: `${tabWidth}px`,
                  height: `${tabHeight}px`,
                  backgroundColor: accentTabColor,
                  borderTopLeftRadius: `${borderRadius}px`,
                  borderTopRightRadius: `${borderRadius}px`,
                  opacity: tabFinalOpacity,
                  zIndex: 10,
                }}
              />
            )}

            {/* The Blue Box (with RTL Wipe Reveal) */}
            <div
              style={{
                clipPath: `inset(0 0 0 ${line1ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
                WebkitClipPath: `inset(0 0 0 ${line1ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
                transformOrigin: 'right center',
                backgroundColor: line1BgColor,
                color: line1TextColor,
                fontSize: `${fontSize}px`,
                fontWeight: 800,
                lineHeight: 1.25,
                padding: '16px 36px',
                borderRadius: `${borderRadius}px`,
                display: 'inline-block',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.3px',
                textAlign: 'center',
                ...shadowStyle,
              }}
            >
              {line1Text}
            </div>
          </div>
        )}

        {/* Line 2: Headline Body Box 1 (White) */}
        {line2Text.trim() && (
          <div
            style={{
              opacity: line2FinalOpacity,
              clipPath: `inset(0 0 0 ${line2ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              WebkitClipPath: `inset(0 0 0 ${line2ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              transformOrigin: 'right center',
            }}
          >
            <div
              style={{
                backgroundColor: line2BgColor,
                color: line2TextColor,
                fontSize: `${fontSize}px`,
                fontWeight: 800,
                lineHeight: 1.25,
                padding: '16px 36px',
                borderRadius: `${borderRadius}px`,
                display: 'inline-block',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.3px',
                textAlign: 'center',
                ...shadowStyle,
              }}
            >
              {line2Text}
            </div>
          </div>
        )}

        {/* Line 3: Headline Body Box 2 (White) */}
        {line3Text.trim() && (
          <div
            style={{
              opacity: line3FinalOpacity,
              clipPath: `inset(0 0 0 ${line3ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              WebkitClipPath: `inset(0 0 0 ${line3ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              transformOrigin: 'right center',
            }}
          >
            <div
              style={{
                backgroundColor: line3BgColor,
                color: line3TextColor,
                fontSize: `${fontSize}px`,
                fontWeight: 800,
                lineHeight: 1.25,
                padding: '16px 36px',
                borderRadius: `${borderRadius}px`,
                display: 'inline-block',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.3px',
                textAlign: 'center',
                ...shadowStyle,
              }}
            >
              {line3Text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
