import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface ArabicBlueNewsBoxesProps {
  // Text content
  line1Text?: string;
  line2Text?: string;
  line3Text?: string;

  // Colors & Blend Modes
  line1BgColor?: string;
  line1TextColor?: string;
  line1BlendMode?: React.CSSProperties['mixBlendMode'];
  line2BgColor?: string;
  line2TextColor?: string;
  line2BlendMode?: React.CSSProperties['mixBlendMode'];
  line3BgColor?: string;
  line3TextColor?: string;
  line3BlendMode?: React.CSSProperties['mixBlendMode'];

  // Sliding Accent Runner Tab (the blue box on top of the first banner)
  showAccentTab?: boolean;
  accentTabColor?: string;
  tabWidth?: number;
  tabHeight?: number;
  runnerSpeed?: number; // pixels moved per frame to the left
  tabStartDelay?: number; // frames after entrance delay before tab appears

  // Background Gradient Overlay (Figma Rectangle 7)
  showGradientOverlay?: boolean;

  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;

  // Layout & Styling
  yOffsetPercent?: number; // 0 - 100 (% from top)
  boxHeight?: number;
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

  // Content defaults from customer's Figma:
  // "أصول جديدة تدخل قائمة البيع وتحذيرات تفاقم أزمة الديون"
  const line1Text = props.line1Text ?? 'أصول جديدة';
  const line2Text = props.line2Text ?? 'تدخل قائمة البيع';
  const line3Text = props.line3Text ?? 'وتحذيرات تفاقم أزمة الديون';

  // Colors & Blend Modes matching Figma exact specs:
  // Line 1: White semi-transparent (screen blend mode), dark text
  const line1BgColor = props.line1BgColor || 'rgba(255, 255, 255, 0.7)';
  const line1TextColor = props.line1TextColor || '#000000';
  const line1BlendMode = props.line1BlendMode || 'screen';

  // Lines 2 & 3: Black 50% semi-transparent (multiply blend mode), white text
  const line2BgColor = props.line2BgColor || 'rgba(0, 0, 0, 0.5)';
  const line2TextColor = props.line2TextColor || '#ffffff';
  const line2BlendMode = props.line2BlendMode || 'multiply';

  const line3BgColor = props.line3BgColor || 'rgba(0, 0, 0, 0.5)';
  const line3TextColor = props.line3TextColor || '#ffffff';
  const line3BlendMode = props.line3BlendMode || 'multiply';

  // Background Gradient Overlay (Figma Rectangle 7: top 328px down to 40% black)
  const showGradientOverlay = props.showGradientOverlay ?? true;

  // Sliding Accent Runner Tab defaults (Figma: 54px x 22px, #1283F9)
  const showAccentTab = props.showAccentTab !== false;
  const accentTabColor = props.accentTabColor || '#1283F9';
  const tabWidth = Number(props.tabWidth ?? 54);
  const tabHeight = Number(props.tabHeight ?? 22);
  const runnerSpeed = Number(props.runnerSpeed ?? 2.2);
  const tabStartDelay = Number(props.tabStartDelay ?? 20);

  // Typography & Layout matching Figma (76px, 112px box height, 26px gap)
  const fontFamily = props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, 'IBM Plex Sans Arabic', sans-serif";
  const fontSize = Number(props.fontSize) || 76;
  const fontWeight = props.fontWeight || 700;
  const boxHeight = Number(props.boxHeight ?? 112);
  const yOffsetPercent = Number(props.yOffsetPercent ?? 54.4); // 1045px / 1920px = 54.4%
  const borderRadius = Number(props.borderRadius ?? 0);
  const gap = Number(props.gap ?? 26); // 1183 - (1045 + 112) = 26px
  const rightMargin = Number(props.rightMargin ?? 54);
  const showShadow = props.showShadow ?? false;
  const align = props.align || 'right';

  // Animation timing
  const entranceDelay = Number(props.entranceDelay ?? 0);
  const staggerDelay = Number(props.staggerDelay ?? 8);
  const enableExitAnimation = props.enableExitAnimation !== false;

  const effectiveDuration = item?.durationInFrames || compositionDuration || 140;
  const exitDelayFrames = Number(props.exitDelayFrames ?? Math.max(entranceDelay + 40, effectiveDuration - 25));
  const exitStaggerDelay = Number(props.exitStaggerDelay ?? 6);
  const exitFadeDuration = 8;

  // Reference canvas (1080x1920 vertical format matching customer's Figma)
  const DESIGN_WIDTH = 1080;
  const DESIGN_HEIGHT = 1920;
  const scale = Math.min(
    (item?.width || DESIGN_WIDTH) / DESIGN_WIDTH,
    (item?.height || DESIGN_HEIGHT) / DESIGN_HEIGHT
  );

  // ── ENTRANCE ANIMATION (Right-to-Left Wipe Reveal) ──
  const line1Spring = spring({
    frame: Math.max(0, frame - entranceDelay),
    fps: safeFps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });

  const line2Spring = spring({
    frame: Math.max(0, frame - (entranceDelay + staggerDelay)),
    fps: safeFps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });

  const line3Spring = spring({
    frame: Math.max(0, frame - (entranceDelay + staggerDelay * 2)),
    fps: safeFps,
    config: { damping: 18, stiffness: 110, mass: 0.8 },
  });

  const line1ClipLeft = Math.max(0, Math.min(100, (1 - line1Spring) * 100));
  const line2ClipLeft = Math.max(0, Math.min(100, (1 - line2Spring) * 100));
  const line3ClipLeft = Math.max(0, Math.min(100, (1 - line3Spring) * 100));

  const line1EntranceOpacity = interpolate(line1Spring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
  const line2EntranceOpacity = interpolate(line2Spring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
  const line3EntranceOpacity = interpolate(line3Spring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });

  // ── SLIDING ACCENT RUNNER TAB DYNAMICS ──
  const tabStartFrame = entranceDelay + tabStartDelay;
  const isTabActive = frame >= tabStartFrame;
  const tabSlideOffset = Math.max(0, (frame - tabStartFrame) * runnerSpeed);
  const tabInitialRight = 10;
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
      {/* Background Gradient Overlay (Figma Rectangle 7) */}
      {showGradientOverlay && (
        <div
          style={{
            position: 'absolute',
            top: '328px',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.4) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}

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
        {/* Line 1: Primary Lead Box (White semi-transparent / Screen blend) with Blue Accent Tab */}
        {line1Text.trim() && (
          <div
            style={{
              position: 'relative',
              opacity: line1FinalOpacity,
            }}
          >
            {/* Sliding Accent Runner Tab on Top Border (Figma: 54px x 22px, #1283F9) */}
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

            {/* The First Box (with RTL Wipe Reveal) */}
            <div
              style={{
                clipPath: `inset(0 0 0 ${line1ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
                WebkitClipPath: `inset(0 0 0 ${line1ClipLeft.toFixed(2)}% round ${borderRadius}px)`,
                transformOrigin: 'right center',
                backgroundColor: line1BgColor,
                mixBlendMode: line1BlendMode,
                color: line1TextColor,
                fontSize: `${fontSize}px`,
                fontWeight,
                lineHeight: 1,
                minHeight: `${boxHeight}px`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 40px',
                borderRadius: `${borderRadius}px`,
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

        {/* Line 2: Headline Body Box 1 (50% Black / Multiply blend) */}
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
                mixBlendMode: line2BlendMode,
                color: line2TextColor,
                fontSize: `${fontSize}px`,
                fontWeight,
                lineHeight: 1,
                minHeight: `${boxHeight}px`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 40px',
                borderRadius: `${borderRadius}px`,
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

        {/* Line 3: Headline Body Box 2 (50% Black / Multiply blend) */}
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
                mixBlendMode: line3BlendMode,
                color: line3TextColor,
                fontSize: `${fontSize}px`,
                fontWeight,
                lineHeight: 1,
                minHeight: `${boxHeight}px`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 40px',
                borderRadius: `${borderRadius}px`,
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
