import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { EmbeddedFonts } from './embeddedFonts';

export interface RssdTextProps {
  // Text content
  line1Text?: string;
  line2Text?: string;
  line3Text?: string;
  lineCount?: 1 | 2 | 3;

  // Source attribution
  showSource?: boolean;
  sourceText?: string;

  // Colors & Themes
  accentColor?: string; // Primary brand accent: #0080F8 (blue), #f22d2d (red), #00b8a7 (teal)
  line1TextColor?: string;
  line2TextColor?: string;
  line2BgColor?: string;
  line3TextColor?: string;
  line3BgColor?: string;
  sourceTextColor?: string;
  sourceBgColor?: string;
  backgroundColor?: string;

  // Typography
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;

  // Layout & Positioning
  bottomOffset?: number; // px from bottom of composition (default 253 -> y2=1187 in 1440p)
  rightOffset?: number; // px from right edge of composition (default 101 -> x2=979 in 1080p)
  boxPaddingX?: number;
  boxPaddingY?: number;
  gap?: number;

  // Animation Controls
  enableEntrance?: boolean;
  enableExitGlitch?: boolean;
  exitStartFrame?: number;
}

export const RssdText: React.FC<
  RssdTextProps & { item?: { props?: RssdTextProps; width?: number; height?: number } }
> = (rawProps) => {
  const props: RssdTextProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { durationInFrames, width: configWidth, height: configHeight } = useVideoConfig();
  const width = rawProps.item?.width || configWidth || 1080;
  const height = rawProps.item?.height || configHeight || 1440;

  // Text content defaults matching reference video & MOGRT
  const lineCount = props.lineCount ?? 2;
  const line1Text = props.line1Text ?? 'السطر الأول يكتب هنا';
  const line2Text = props.line2Text ?? 'ثم يأتي السطر الثاني';
  const line3Text = props.line3Text ?? 'فالثالث';
  const showSource = props.showSource ?? false;
  const sourceText = props.sourceText ?? 'هنا المصدر';

  // Colors matching rasd/text.mp4
  const accentColor = props.accentColor || '#0080F8';
  const line1TextColor = props.line1TextColor || '#ffffff';
  const line2TextColor = props.line2TextColor || '#000000';
  const line2BgColor = props.line2BgColor || '#ffffff';
  const line3TextColor = props.line3TextColor || '#000000';
  const line3BgColor = props.line3BgColor || '#ffffff';
  const sourceTextColor = props.sourceTextColor || '#ffffff';
  const sourceBgColor = props.sourceBgColor || 'rgba(0, 0, 0, 0.72)';
  const backgroundColor = props.backgroundColor || 'transparent';

  // Typography & Layout matching rasd/text.mp4 (x: 305..979, y: 940..1187)
  const fontFamily =
    props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, sans-serif";
  const fontSize = props.fontSize ?? 80;
  const fontWeight = props.fontWeight ?? 300;
  const boxPaddingX = props.boxPaddingX ?? 34;
  const boxPaddingY = props.boxPaddingY ?? 15;
  const gap = props.gap ?? 12;
  const bottomOffset = props.bottomOffset ?? 253;
  const rightOffset = props.rightOffset ?? 101;

  // Animation Controls
  const enableEntrance = props.enableEntrance !== false;
  const enableExitGlitch = props.enableExitGlitch !== false;
  const exitStartFrame = props.exitStartFrame ?? Math.max(35, durationInFrames - 15);

  // ─── 1. Entrance Wipe & Detached Runner Blocks (Frames 4 – 34) ─────────────
  const l1Progress = enableEntrance
    ? interpolate(frame, [5, 28], [0, 1], {
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

  const srcProgress = enableEntrance
    ? interpolate(frame, [24, 42], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  // Detached blue runner block ahead of Line 1 (frames 4 to 27)
  // Shoots from right=20px out to x=186..275 (right=704px from right edge of L1)
  const showL1Runner = enableEntrance && frame >= 4 && frame <= 26;
  const l1RunnerRightPx = interpolate(frame, [4, 18, 26], [20, 704, 705], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const l1RunnerWidthPx = interpolate(frame, [4, 10, 18, 26], [80, 180, 89, 85], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Detached dark grey runner block ahead of Line 2 (frames 11 to 19)
  const showL2Runner = enableEntrance && frame >= 11 && frame <= 19;
  const l2RunnerRightPx = interpolate(frame, [11, 16, 19], [35, 360, 490], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });

  // ─── 2. Top-Right White Tab Horizontal Glide (Frames 13 – 141) ─────────────
  // Starts slightly past the right edge (-92px) at f14, settles at -36px at f30,
  // then continuously drifts leftward across the top of Line 1 to +152px by f141
  const showTopTab =
    (!enableEntrance || frame >= 13) && (!enableExitGlitch || frame < exitStartFrame + 7);
  const tabRightPx = enableEntrance
    ? interpolate(
        frame,
        [13, 22, 30, Math.max(31, exitStartFrame + 6)],
        [-92, -48, -36, 152],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      )
    : 0;
  const tabOpacity =
    enableEntrance && frame < 20
      ? interpolate(frame, [13, 20], [0.25, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1;

  // ─── 3. Outro Strobe & Stepped Cut (Frames 135 – 147) ──────────────────────
  // Matches rasd/text.mp4: Line 1 dims/strobes first (f136..141) and cuts out at f142;
  // Line 2 dims/strobes next (f140..146) and cuts out at f147. No horizontal jitter.
  let exitOpacityL1 = 1;
  let exitOpacityL2 = 1;
  let exitOpacityL3 = 1;
  let exitOpacitySrc = 1;

  if (enableExitGlitch && frame >= exitStartFrame) {
    const fRel = frame - exitStartFrame; // exitStartFrame defaults to 135
    const l1Strobe = [1, 0.85, 0.65, 0.72, 0.48, 0.43, 0.39, 0];
    const l2Strobe = [1, 1, 1, 1, 1, 0.92, 0.76, 0.71, 0.51, 0.4, 0.41, 0.08, 0];
    const l3Strobe = [1, 1, 1, 0.85, 0.6, 0.4, 0.2, 0];
    const srcStrobe = [0.63, 0.73, 0.36, 0.53, 0];

    exitOpacityL1 = l1Strobe[Math.min(fRel, l1Strobe.length - 1)];
    exitOpacityL2 = l2Strobe[Math.min(fRel, l2Strobe.length - 1)];
    exitOpacityL3 = l3Strobe[Math.min(fRel, l3Strobe.length - 1)];
    exitOpacitySrc = srcStrobe[Math.min(fRel, srcStrobe.length - 1)];
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
      <div
        data-occ-bounds="true"
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          right: rightOffset,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start', // In RTL flex container, flex-start aligns right edges flush
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
            opacity: exitOpacityL1,
            marginBottom: lineCount >= 2 ? gap : 0,
          }}
        >
          {/* Small Top White Tab that glides horizontally right-to-left */}
          {showTopTab && (
            <div
              style={{
                position: 'absolute',
                top: -16,
                right: tabRightPx,
                width: 36,
                height: 13,
                backgroundColor: '#ffffff',
                opacity: tabOpacity,
                zIndex: 3,
              }}
            />
          )}

          {/* Detached Leading Blue Runner Block */}
          {showL1Runner && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: l1RunnerRightPx,
                width: l1RunnerWidthPx,
                height: 48,
                backgroundColor: accentColor,
                zIndex: 1,
              }}
            />
          )}

          {/* Line 1 Box & Text with RTL Wipe */}
          <div
            style={{
              position: 'relative',
              backgroundColor: accentColor,
              padding: `${boxPaddingY}px ${boxPaddingX}px`,
              height: 120,
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
                transform: 'translateY(-2px)',
              }}
            >
              {line1Text}
            </span>
          </div>
        </div>

        {/* ─── LINE 2: SECONDARY BOX (White) ─── */}
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
            {/* Detached Dark Grey Runner Block */}
            {showL2Runner && (
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  right: l2RunnerRightPx,
                  width: 146,
                  height: 48,
                  backgroundColor: '#1d1d1d',
                  zIndex: 1,
                }}
              />
            )}

            <div
              style={{
                position: 'relative',
                backgroundColor: line2BgColor,
                padding: `${boxPaddingY}px ${boxPaddingX}px`,
                height: 116,
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
                  transform: 'translateY(-2px)',
                }}
              >
                {line2Text}
              </span>
            </div>
          </div>
        )}

        {/* ─── LINE 3: TERTIARY BOX (Optional) ─── */}
        {lineCount >= 3 && (
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
                height: 116,
                boxSizing: 'border-box',
                clipPath: `inset(0 0 0 ${100 - l3Progress * 100}%)`,
                display: 'inline-flex',
                alignItems: 'center',
                zIndex: 2,
              }}
            >
              <span
                style={{
                  color: line3TextColor,
                  fontSize,
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

        {/* ─── SOURCE ATTRIBUTION (Optional) ─── */}
        {showSource && (
          <div
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              marginTop: 10,
              opacity: exitOpacitySrc,
            }}
          >
            <div
              style={{
                backgroundColor: sourceBgColor,
                padding: '6px 22px',
                clipPath: `inset(0 0 0 ${100 - srcProgress * 100}%)`,
              }}
            >
              <span
                style={{
                  color: sourceTextColor,
                  fontSize: Math.round(fontSize * 0.5),
                  fontWeight,
                  whiteSpace: 'nowrap',
                }}
              >
                {sourceText}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
