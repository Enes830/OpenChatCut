import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export interface ArabicHeadlineBoxesProps {
  // Text content
  topText?: string;
  bottomText?: string;
  subtitleText?: string;
  showSubtitle?: boolean;

  // Colors
  topBgColor?: string;
  topTextColor?: string;
  bottomBgColor?: string;
  bottomTextColor?: string;

  // Typography
  fontFamily?: string;
  fontSize?: number;

  // Layout & Styling
  yOffsetPercent?: number; // 0 - 100 (% from top)
  borderRadius?: number;
  gap?: number;
  showShadow?: boolean;
  align?: 'center' | 'right' | 'left';

  // Animation timing
  entranceDelay?: number; // frames before starting
  animDuration?: number; // frames for wipe animation
  staggerDelay?: number; // delay between top and bottom boxes
}

export const ArabicHeadlineBoxes: React.FC<{ item?: { props?: ArabicHeadlineBoxesProps; width?: number; height?: number } }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const safeFps = fps || 30;

  const props = item?.props || {};

  // Content defaults from the reference video
  const topText = props.topText ?? 'أشيلكم إنتوا التلاتة';
  const bottomText = props.bottomText ?? 'ربنا يخليك لينا يا بابا';
  const subtitleText = props.subtitleText ?? 'أنا عايزة أوريكم بابا';
  const showSubtitle = props.showSubtitle ?? true;

  // Visual styling defaults
  const topBgColor = props.topBgColor || '#c41824';
  const topTextColor = props.topTextColor || '#ffffff';
  const bottomBgColor = props.bottomBgColor || '#ffffff';
  const bottomTextColor = props.bottomTextColor || '#111111';
  const fontFamily = props.fontFamily || 'GhroobArabic, "Noto Sans Arabic", sans-serif';
  const fontSize = Number(props.fontSize) || 52;
  const yOffsetPercent = Number(props.yOffsetPercent ?? 68);
  const borderRadius = Number(props.borderRadius ?? 12);
  const gap = Number(props.gap ?? 14);
  const showShadow = props.showShadow !== false;
  const align = props.align || 'center';

  // Timing defaults
  const entranceDelay = Number(props.entranceDelay ?? 8);
  const staggerDelay = Number(props.staggerDelay ?? 6);

  // 1080x1920 reference canvas (9:16 vertical video)
  const DESIGN_WIDTH = 1080;
  const DESIGN_HEIGHT = 1920;
  const scale = Math.min(
    (item?.width || DESIGN_WIDTH) / DESIGN_WIDTH,
    (item?.height || DESIGN_HEIGHT) / DESIGN_HEIGHT
  );

  // ── ANIMATION DYNAMICS ──
  // Top (Red) Box Animation: Right-to-Left wipe with slight slide & spring ease
  const topSpring = spring({
    frame: Math.max(0, frame - entranceDelay),
    fps: safeFps,
    config: { damping: 16, stiffness: 120, mass: 0.8 },
  });

  // Bottom (White) Box Animation: Staggered RTL wipe
  const bottomSpring = spring({
    frame: Math.max(0, frame - (entranceDelay + staggerDelay)),
    fps: safeFps,
    config: { damping: 16, stiffness: 120, mass: 0.8 },
  });

  // Subtitle Pill Animation: Soft fade-in and slide-up
  const subtitleSpring = spring({
    frame: Math.max(0, frame - (entranceDelay + staggerDelay + 4)),
    fps: safeFps,
    config: { damping: 20, stiffness: 100 },
  });

  // RTL wipe calculations:
  // As spring goes 0 -> 1, the left clipping inset goes 100% -> 0%
  // This reveals the box from the RIGHT edge to the LEFT edge.
  const topClipLeft = Math.max(0, Math.min(100, (1 - topSpring) * 100));
  const bottomClipLeft = Math.max(0, Math.min(100, (1 - bottomSpring) * 100));

  // Subtle momentum slide from the right during the wipe
  const topSlideX = (1 - topSpring) * 35;
  const bottomSlideX = (1 - bottomSpring) * 35;

  // Opacity guards
  const topOpacity = interpolate(topSpring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
  const bottomOpacity = interpolate(bottomSpring, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(subtitleSpring, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleSlideY = (1 - subtitleSpring) * 15;

  const shadowStyle = showShadow
    ? {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.18)',
      }
    : {};

  const containerAlignStyle: React.CSSProperties =
    align === 'right'
      ? { alignItems: 'flex-end', paddingRight: 60 }
      : align === 'left'
      ? { alignItems: 'flex-start', paddingLeft: 60 }
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
        {/* Top Red Box */}
        {topText.trim() && (
          <div
            style={{
              opacity: topOpacity,
              clipPath: `inset(0 0 0 ${topClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              WebkitClipPath: `inset(0 0 0 ${topClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              transform: `translateX(${topSlideX.toFixed(2)}px)`,
              transformOrigin: 'right center',
              transition: 'none',
            }}
          >
            <div
              style={{
                backgroundColor: topBgColor,
                color: topTextColor,
                fontSize: `${fontSize}px`,
                fontWeight: 800,
                lineHeight: 1.25,
                padding: '14px 34px',
                borderRadius: `${borderRadius}px`,
                display: 'inline-block',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.3px',
                textAlign: 'center',
                ...shadowStyle,
              }}
            >
              {topText}
            </div>
          </div>
        )}

        {/* Bottom White Box */}
        {bottomText.trim() && (
          <div
            style={{
              opacity: bottomOpacity,
              clipPath: `inset(0 0 0 ${bottomClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              WebkitClipPath: `inset(0 0 0 ${bottomClipLeft.toFixed(2)}% round ${borderRadius}px)`,
              transform: `translateX(${bottomSlideX.toFixed(2)}px)`,
              transformOrigin: 'right center',
              transition: 'none',
            }}
          >
            <div
              style={{
                backgroundColor: bottomBgColor,
                color: bottomTextColor,
                fontSize: `${Math.round(fontSize * 0.96)}px`,
                fontWeight: 900,
                lineHeight: 1.25,
                padding: '14px 34px',
                borderRadius: `${borderRadius}px`,
                display: 'inline-block',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.3px',
                textAlign: 'center',
                ...shadowStyle,
              }}
            >
              {bottomText}
            </div>
          </div>
        )}

        {/* Subtitle Pill (Optional, matching the reference video) */}
        {showSubtitle && subtitleText.trim() && (
          <div
            style={{
              marginTop: '16px',
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleSlideY.toFixed(2)}px)`,
              backgroundColor: 'rgba(20, 20, 20, 0.78)',
              backdropFilter: 'blur(8px)',
              color: '#ffffff',
              fontSize: `${Math.round(fontSize * 0.52)}px`,
              fontWeight: 600,
              padding: '8px 22px',
              borderRadius: '20px',
              display: 'inline-block',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            {subtitleText}
          </div>
        )}
      </div>
    </div>
  );
};
