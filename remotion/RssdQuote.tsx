import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { EmbeddedFonts } from './embeddedFonts';

export interface RssdQuoteProps {
  // Quote text content (can be multi-line string or array of lines)
  quoteText?: string;
  quoteLines?: string[];

  // Speaker attribution
  speakerName?: string;
  speakerTitle?: string;
  showAttribution?: boolean;

  // Colors & Themes
  accentColor?: string; // Brand Blue (#0080F8), Red (#f22d2d), Teal (#00b8a7)
  cardBgColor?: string;
  quoteTextColor?: string;
  speakerNameBgColor?: string;
  speakerNameTextColor?: string;
  speakerTitleBgColor?: string;
  speakerTitleTextColor?: string;
  backgroundColor?: string;

  // Typography
  fontFamily?: string;
  quoteFontSize?: number;
  quoteLineHeight?: number;
  quoteFontWeight?: number;
  speakerNameFontSize?: number;
  speakerTitleFontSize?: number;

  // Layout & Sizing
  cardWidth?: number;
  cardHeight?: number;
  topOffset?: number; // px from top of composition (default 415 in 1440 canvas)
  rightOffset?: number; // px from right edge of composition (default 101 -> x2=979 in 1080 canvas)

  // Animation Controls
  enableEntrance?: boolean;
}

export const RssdQuote: React.FC<RssdQuoteProps & { item?: { props?: RssdQuoteProps } }> = (rawProps) => {
  const props: RssdQuoteProps = { ...rawProps, ...(rawProps.item?.props || {}) };
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();

  // Content defaults with exact Kashida matching rasd/quotes.mp4
  const defaultQuote = [
    'اتصلــــــــت للتــــو بالسيناتور كيسي،',
    'وعضو الكونغرس كارترايت، لإبداء أسفي',
    'على عدم حضور مناسبة اليوم اتصلت',
    'للتـــو بالسيناتور كيسي، وعضو الكونغرس',
    'كارترايت، لإبداء أسفي على عدم حضور',
    'مناسبة اليوم وشكـــــرًا لـكـم',
  ].join('\n');

  // If caller passed plain non-Kashida default text, upgrade it to the exact Kashida lines
  const rawQuoteText = props.quoteText ?? defaultQuote;
  const normalizedQuoteText = rawQuoteText.includes('اتصلـت للتو بالسيناتور كيسي')
    ? defaultQuote
    : rawQuoteText;

  const quoteLines = props.quoteLines ?? normalizedQuoteText.split('\n');
  const rawSpeakerName = props.speakerName ?? 'محــمد بن سـلــمـان';
  const speakerName =
    rawSpeakerName === 'محمد بن سلمان' ? 'محــمد بن سـلــمـان' : rawSpeakerName;
  const speakerTitle = props.speakerTitle ?? 'ولي العهد السعودي';
  const showAttribution = props.showAttribution !== false;

  // Colors matching rasd/quotes.mp4
  const accentColor = props.accentColor || '#0080F8';
  const cardBgColor = props.cardBgColor || '#ffffff';
  const quoteTextColor = props.quoteTextColor || '#1b1b1b';
  const speakerNameBgColor = props.speakerNameBgColor || '#ffffff';
  const speakerNameTextColor = props.speakerNameTextColor || '#111111';
  const speakerTitleBgColor = props.speakerTitleBgColor || accentColor;
  const speakerTitleTextColor = props.speakerTitleTextColor || '#ffffff';
  const backgroundColor = props.backgroundColor || 'transparent';

  // Typography & Layout matching rasd/quotes.mp4 (card x: 113..979, y: 415..959)
  const fontFamily =
    props.fontFamily || "'Ghroob Arabic itf', GhroobArabic, 'Noto Sans Arabic', Cairo, sans-serif";
  const quoteFontSize = props.quoteFontSize ?? 55;
  const quoteLineHeight = props.quoteLineHeight ?? 79.5;
  const quoteFontWeight = props.quoteFontWeight ?? 300;
  const speakerNameFontSize = props.speakerNameFontSize ?? 40;
  const speakerTitleFontSize = props.speakerTitleFontSize ?? 30;

  const cardWidth = props.cardWidth ?? 866;
  const cardHeight = props.cardHeight ?? 544;
  const topOffset = props.topOffset ?? 415;
  const rightOffset = props.rightOffset ?? 101;

  const enableEntrance = props.enableEntrance !== false;

  // ─── 1. Stage A: Initial Horizontal Blue+White Bar Shoot-Across (Frames 4 – 19) ─
  // At y=415 (top edge of card), a 9px tall bar with blue left segment & white right segment
  // shoots from x=1080 (right=-101) all the way across to x=0 (right=979).
  const showShootBar = enableEntrance && frame >= 4 && frame <= 19;
  const shootBarRightPx = interpolate(frame, [4, 18], [-101, 880], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const shootBarBlueWidth = interpolate(frame, [4, 10, 18], [30, 110, 68], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shootBarWhiteWidth = interpolate(frame, [4, 10, 18], [40, 175, 92], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ─── 2. Stage B: Main White Card Vertical Wipe & Dark-to-White Flash (Frames 20 – 35) ─
  const showCard = !enableEntrance || frame >= 20;
  const cardRevealProgress = enableEntrance
    ? interpolate(frame, [20, 35], [0.35, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 1;

  // Card luminance flash from dark grey (#141414 at f22 -> #525252 at f25 -> #f0f0f0 at f30 -> #ffffff at f35)
  const cardLum = enableEntrance
    ? Math.round(
        interpolate(frame, [20, 22, 25, 30, 35], [18, 22, 82, 240, 255], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      )
    : 255;
  const activeCardBg =
    cardLum >= 254 ? cardBgColor : `rgb(${cardLum}, ${cardLum}, ${cardLum})`;

  // ─── 3. Top-Right Blue Quote Badge & Sliding White Tab ───────────────────────
  // Blue badge (108x91) appears at f18, darkening in from #082d52 -> #0080F8 by f25
  const showQuoteBadge = !enableEntrance || frame >= 18;
  const badgeOpacity = enableEntrance
    ? interpolate(frame, [18, 25], [0.35, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  // Small white tab (40x15 at y=307..322, 16px above the blue quote badge)
  // Enters from right (-100px at f18 -> -39px at f30), then glides left across the composition
  // to +197px (x=742..782) by frame 375!
  const showTopTab = !enableEntrance || frame >= 18;
  const topTabRightPx = enableEntrance
    ? interpolate(
        frame,
        [18, 25, 30, Math.max(60, durationInFrames)],
        [-100, -43, -39, 197],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }
      )
    : -25;

  // ─── 4. Speaker Attribution Badges Slide/Expand from Right (Frames 22 – 52) ──
  // Speaker Name white box (y: 960..1020) slides in from right and settles flush at right=0
  const showSpeakerName = showAttribution && (!enableEntrance || frame >= 22);
  const speakerNameOffsetRight = enableEntrance
    ? interpolate(frame, [22, 30, 42], [-210, -35, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const speakerNameClipLeft = enableEntrance
    ? interpolate(frame, [22, 34], [65, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 0;

  // Speaker Title blue box (y: 1020..1055) slides in from right and settles flush at right=0
  const showSpeakerTitle = showAttribution && (!enableEntrance || frame >= 34);
  const speakerTitleOffsetRight = enableEntrance
    ? interpolate(frame, [34, 44, 52], [-160, -20, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const speakerTitleClipLeft = enableEntrance
    ? interpolate(frame, [34, 46], [60, 0], {
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
      <div
        style={{
          position: 'absolute',
          top: topOffset,
          right: rightOffset,
          width: cardWidth,
          fontFamily,
          direction: 'rtl',
        }}
      >
        {/* ─── STAGE A: INITIAL HORIZONTAL BLUE+WHITE BAR (Frames 4–19) ─── */}
        {showShootBar && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: shootBarRightPx,
              display: 'flex',
              flexDirection: 'row', // In RTL: first child (White) on right, second child (Blue) on left
              height: 9,
              zIndex: 20,
            }}
          >
            <div
              style={{
                width: shootBarWhiteWidth,
                height: 9,
                backgroundColor: '#ffffff',
              }}
            />
            <div
              style={{
                width: shootBarBlueWidth,
                height: 9,
                backgroundColor: accentColor,
              }}
            />
          </div>
        )}

        {/* ─── TOP RIGHT QUOTE BADGE + SLIDING WHITE ACCENT TAB ─── */}
        {showQuoteBadge && (
          <div
            style={{
              position: 'absolute',
              top: -92,
              right: 0,
              opacity: badgeOpacity,
              zIndex: 10,
            }}
          >
            {/* Small white tab above the blue quote badge that glides horizontally */}
            {showTopTab && (
              <div
                style={{
                  position: 'absolute',
                  top: -16,
                  right: topTabRightPx,
                  width: 40,
                  height: 15,
                  backgroundColor: '#ffffff',
                }}
              />
            )}

            {/* Blue quote badge (108 × 91 px, matching rasd/quotes.mp4) */}
            <div
              style={{
                width: 108,
                height: 91,
                backgroundColor: accentColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Exact Geometric Double Quotation Marks from Pre-comp 4 in Rssd - Quote.mogrt */}
              <svg width="62" height="38" viewBox="0 0 62 38" fill="none">
                <defs>
                  <filter id="rssdQuoteGrain" x="0%" y="0%" width="100%" height="100%">
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.85"
                      numOctaves="2"
                      seed="7"
                      result="noise"
                    />
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 0.88  0 0 0 0 0.88  0 0 0 0 0.88  0 0 0 0.16 0"
                      in="noise"
                      result="coloredNoise"
                    />
                    <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="grain" />
                    <feBlend mode="multiply" in="SourceGraphic" in2="grain" />
                  </filter>
                </defs>
                <g filter="url(#rssdQuoteGrain)" fill="#f5f5f5">
                  {/* Left Geometric Quote Mark: 26x24 top block + right-side diagonal bevel tail */}
                  <path d="M 1 1 H 27 V 25 L 15 37 V 25 H 1 Z" />
                  {/* Right Geometric Quote Mark: 26x24 top block + right-side diagonal bevel tail */}
                  <path d="M 35 1 H 61 V 25 L 49 37 V 25 H 35 Z" />
                </g>
              </svg>
            </div>
          </div>
        )}

        {/* ─── MAIN WHITE QUOTE CARD (866 × 544 px) ─── */}
        {showCard && (
          <div
            style={{
              backgroundColor: activeCardBg,
              width: cardWidth,
              minHeight: cardHeight,
              padding: '30px 32px 32px 42px',
              boxSizing: 'border-box',
              clipPath: `inset(0 0 ${100 - cardRevealProgress * 100}% 0)`,
              position: 'relative',
            }}
          >
            {/* Quote Body Lines (Mister Horse LAW#1#1: staggered line/word fade + upward glide) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
              }}
            >
              {quoteLines.map((line, idx) => {
                const isLastLine = idx === quoteLines.length - 1;
                const words = line.trim().split(/\s+/);
                const lineStartFrame = 22 + idx * 2.2;

                const lineSlideY = enableEntrance
                  ? interpolate(frame, [lineStartFrame, lineStartFrame + 10], [26, 0], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                    })
                  : 0;

                return (
                  <div
                    key={idx}
                    style={{
                      color: quoteTextColor,
                      fontSize: quoteFontSize,
                      lineHeight: `${quoteLineHeight}px`,
                      fontWeight: quoteFontWeight,
                      textAlign: isLastLine ? 'right' : 'justify',
                      textAlignLast: isLastLine ? 'right' : 'justify',
                      transform: `translateY(${lineSlideY}px)`,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      justifyContent: isLastLine ? 'flex-start' : 'space-between',
                      gap: isLastLine ? '14px' : undefined,
                    }}
                  >
                    {words.map((word, wIdx) => {
                      const wordStart = lineStartFrame + wIdx * 0.6;
                      const wordOpacity = enableEntrance
                        ? interpolate(frame, [wordStart, wordStart + 7], [0, 1], {
                            extrapolateLeft: 'clamp',
                            extrapolateRight: 'clamp',
                          })
                        : 1;
                      return (
                        <span
                          key={wIdx}
                          style={{
                            opacity: wordOpacity,
                            display: 'inline-block',
                          }}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── BOTTOM RIGHT SPEAKER ATTRIBUTION BADGES (Flush with Card Bottom) ─── */}
        {showAttribution && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start', // Flush right-aligned at x=979 in RTL
              marginTop: 1,
            }}
          >
            {/* Speaker Name White Badge (No border, flush right, y: 960..1020) */}
            {showSpeakerName && (
              <div
                style={{
                  backgroundColor: speakerNameBgColor,
                  height: 60,
                  padding: '0 22px',
                  boxSizing: 'border-box',
                  transform: `translateX(${-speakerNameOffsetRight}px)`,
                  clipPath: `inset(0 0 0 ${speakerNameClipLeft}%)`,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    color: speakerNameTextColor,
                    fontSize: speakerNameFontSize,
                    fontWeight: quoteFontWeight,
                    whiteSpace: 'nowrap',
                    transform: 'translateY(-2px)',
                  }}
                >
                  {speakerName}
                </span>
              </div>
            )}

            {/* Speaker Title Blue Badge (Directly touching Speaker Name badge, y: 1020..1055) */}
            {showSpeakerTitle && (
              <div
                style={{
                  backgroundColor: speakerTitleBgColor,
                  height: 36,
                  padding: '0 15px',
                  boxSizing: 'border-box',
                  transform: `translateX(${-speakerTitleOffsetRight}px)`,
                  clipPath: `inset(0 0 0 ${speakerTitleClipLeft}%)`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginTop: 0,
                }}
              >
                <span
                  style={{
                    color: speakerTitleTextColor,
                    fontSize: speakerTitleFontSize,
                    fontWeight: quoteFontWeight,
                    whiteSpace: 'nowrap',
                    transform: 'translateY(-1px)',
                  }}
                >
                  {speakerTitle}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
