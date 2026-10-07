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
        height={1080}
        defaultProps={{
          item: {
            props: {
              line1Text: 'أحد رجال مبارك',
              line2Text: 'ومن أشد المعادين',
              line3Text: 'للرئيس الراحل محمد مرسي',
              line1BgColor: '#0f83f3',
              showAccentTab: true,
            },
          },
        }}
      />
    </>
  );
}

