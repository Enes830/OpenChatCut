import { Composition } from 'remotion';
import { TimelineComposition } from '../src/editor/TimelineComposition';
import { timelineDuration, type TimelineState } from '../src/editor/types';
import { resolveTimelineRenderPlan } from '../src/editor/sequenceGraph';
import { loadProjectFonts } from '../src/fonts/googleFonts';

// Register local faces; TimelineComposition registers used Google faces before render.
loadProjectFonts();

// A single composition that renders the entire editor timeline. Its dimensions
// and length are derived per-render from the `state` input prop, so the headless
// render matches whatever the Player shows in the browser.
const EMPTY_STATE: TimelineState = {
  fps: 30,
  width: 1920,
  height: 1080,
  items: [],
  selectedId: null,
};

import { ArabicHeadlineBoxes } from './ArabicHeadlineBoxes';
import { ArabicBlueNewsBoxes } from './ArabicBlueNewsBoxes';
import { RssdText } from './RssdText';
import { RssdRaw } from './RssdRaw';
import { RssdQuote } from './RssdQuote';
import { RssdLocationHeadline, RssdLocation } from './RssdLocationHeadline';

export function Root() {
  return (
    <>
      <Composition
        id="timeline"
        component={TimelineComposition}
        defaultProps={{ state: EMPTY_STATE, transparent: false }}
        // Metadata comes from the timeline itself — same source of truth as the
        // Player (see timelineDuration in src/editor/types.ts). Min 1 frame.
        calculateMetadata={({ props }) => {
          const { state, project, timelineId } = props;
          const durationInFrames = project && timelineId
            ? resolveTimelineRenderPlan(project, timelineId).durationInFrames
            : timelineDuration(state);
          return {
            durationInFrames: Math.max(1, durationInFrames),
            fps: state.fps,
            width: state.width,
            height: state.height,
          };
        }}
        // Fallbacks only; calculateMetadata overrides these before every render.
        durationInFrames={Math.max(1, timelineDuration(EMPTY_STATE))}
        fps={EMPTY_STATE.fps}
        width={EMPTY_STATE.width}
        height={EMPTY_STATE.height}
      />
      <Composition
        id="ArabicHeadlineBoxes"
        component={ArabicHeadlineBoxes}
        durationInFrames={120}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          item: {
            props: {
              topText: 'أشيلكم إنتوا التلاتة',
              bottomText: 'ربنا يخليك لينا يا بابا',
              subtitleText: 'أنا عايزة أوريكم بابا',
              showSubtitle: true,
            },
          },
        }}
      />
      <Composition
        id="ArabicBlueNewsBoxes"
        component={ArabicBlueNewsBoxes}
        durationInFrames={140}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          item: {
            props: {
              line1Text: 'أصول جديدة',
              line2Text: 'تدخل قائمة البيع',
              line3Text: 'وتحذيرات تفاقم أزمة الديون',
              line1BgColor: 'rgba(255, 255, 255, 0.7)',
              line1TextColor: '#000000',
              line2BgColor: 'rgba(0, 0, 0, 0.5)',
              line2TextColor: '#ffffff',
              line3BgColor: 'rgba(0, 0, 0, 0.5)',
              line3TextColor: '#ffffff',
              accentTabColor: '#1283F9',
              showAccentTab: true,
              showGradientOverlay: true,
            },
          },
        }}
      />
      <Composition
        id="RssdText"
        component={RssdText}
        durationInFrames={150}
        fps={25}
        width={1080}
        height={1440}
        defaultProps={{
          line1Text: 'السطر الأول يكتب هنا',
          line2Text: 'ثم يأتي السطر الثاني',
          lineCount: 2,
          accentColor: '#0080F8',
          line1TextColor: '#ffffff',
          line2TextColor: '#000000',
          line2BgColor: '#ffffff',
          backgroundColor: '#000000',
          showSource: false,
          sourceText: 'هنا المصدر',
        }}
      />
      <Composition
        id="RssdRaw"
        component={RssdRaw}
        durationInFrames={150}
        fps={25}
        width={1080}
        height={1440}
        defaultProps={{
          line1Text: 'القضية الفلسطينية',
          line2Text: 'روهات رصد',
          accentColor: '#0080F8',
          line1TextColor: '#ffffff',
          line2TextColor: '#000000',
          line2BgColor: '#ffffff',
          backgroundColor: '#000000',
          showAccentBlock: true,
        }}
      />
      <Composition
        id="RssdQuote"
        component={RssdQuote}
        durationInFrames={375}
        fps={25}
        width={1080}
        height={1440}
        defaultProps={{
          quoteText: `اتصلــــــــت للتــــو بالسيناتور كيسي،
وعضو الكونغرس كارترايت، لإبداء أسفي
على عدم حضور مناسبة اليوم اتصلت
للتـــو بالسيناتور كيسي، وعضو الكونغرس
كارترايت، لإبداء أسفي على عدم حضور
مناسبة اليوم وشكـــــرًا لـكـم`,
          speakerName: 'محــمد بن سـلــمـان',
          speakerTitle: 'ولي العهد السعودي',
          accentColor: '#0080F8',
          backgroundColor: '#000000',
          showAttribution: true,
        }}
      />
      <Composition
        id="RssdLocationHeadline"
        component={RssdLocationHeadline}
        durationInFrames={150}
        fps={25}
        width={1080}
        height={1920}
        defaultProps={{
          showLocation: true,
          locationText: 'القاهرة',
          line1Text: 'انقلاب سيارة على',
          line2Text: 'طريق مصر الصحراوي',
          line1BgColor: '#ffffff',
          line1TextColor: '#000000',
          line2BgColor: '#1283F9',
          line2TextColor: '#ffffff',
          accentColor: '#1283F9',
          showAccentBlock: true,
          fontSize: 95,
          locationColor: '#ffffff',
          backgroundColor: 'transparent',
        }}
      />
      <Composition
        id="RssdLocation"
        component={RssdLocation}
        durationInFrames={150}
        fps={25}
        width={1080}
        height={1920}
        defaultProps={{
          showLocation: true,
          locationText: 'القاهرة',
          locationColor: '#ffffff',
          backgroundColor: 'transparent',
        }}
      />
    </>
  );
}

