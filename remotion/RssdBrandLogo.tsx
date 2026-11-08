import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const RASD_LOGO_DATA_URI =
  'data:image/png;base64,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';

export interface RssdBrandLogoProps {
  logoTop?: number;
  logoRight?: number;
  logoWidth?: number;
  logoHeight?: number;
  enableEntrance?: boolean;
}

export const RssdBrandLogo: React.FC<
  RssdBrandLogoProps & { item?: { props?: RssdBrandLogoProps; width?: number; height?: number } }
> = (rawProps) => {
  const props: RssdBrandLogoProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { width: configWidth, height: configHeight } = useVideoConfig();
  const width = rawProps.item?.width || configWidth || 1080;
  const height = rawProps.item?.height || configHeight || 1920;

  const logoTop = props.logoTop ?? 502;
  const logoRight = props.logoRight ?? 134;
  const logoWidth = props.logoWidth ?? 149;
  const logoHeight = props.logoHeight ?? 46;
  const enableEntrance = props.enableEntrance !== false;

  const entranceOpacity = enableEntrance
    ? interpolate(frame, [2, 10], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

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
          top: logoTop,
          right: logoRight,
          width: logoWidth,
          height: logoHeight,
          opacity: entranceOpacity,
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
    </div>
  );
};

