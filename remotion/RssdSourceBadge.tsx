import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export interface RssdSourceBadgeProps {
  sourceText?: string;
  sourceLeft?: number;
  sourceTop?: number;
  sourceFontSize?: number;
  sourceBgColor?: string;
  sourceTextColor?: string;
  accentColor?: string;
  enableEntrance?: boolean;
}

export const RssdSourceBadge: React.FC<
  RssdSourceBadgeProps & { item?: { props?: RssdSourceBadgeProps; width?: number; height?: number } }
> = (rawProps) => {
  const props: RssdSourceBadgeProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { width: configWidth, height: configHeight } = useVideoConfig();
  const width = rawProps.item?.width || configWidth || 1080;
  const height = rawProps.item?.height || configHeight || 1920;

  const sourceText = (props.sourceText ?? '@anas_habib').trim();
  const sourceLeft = props.sourceLeft ?? 106;
  const sourceTop = props.sourceTop ?? 207;
  const sourceBgColor = props.sourceBgColor || '#000000';
  const sourceTextColor = props.sourceTextColor || '#ffffff';
  const sourceFontSize = props.sourceFontSize ?? 31;
  const accentColor = props.accentColor || '#1283F9';
  const enableEntrance = props.enableEntrance !== false;

  // ─── Source Badge Entrance Wipe (Frames 3 – 19) ───
  const srcProgress = enableEntrance
    ? interpolate(frame, [3, 19], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  // Small two-tone runner block (المستطيل الصغير) during entrance (Frames 3 – 22)
  const showSrcRunner = enableEntrance && frame >= 3 && frame <= 22;
  const srcRunnerProgress = interpolate(frame, [3, 14, 22], [0, 1, 0], {
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
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        data-occ-bounds="true"
        style={{
          position: 'absolute',
          top: sourceTop,
          left: sourceLeft,
          display: 'inline-flex',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        {/* MOGRT Two-Tone Top-Left Runner */}
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
    </div>
  );
};

