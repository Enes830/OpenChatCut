import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { PlayerRef } from '@remotion/player';
import { useExternalAgentBridge } from '../agent/useExternalAgentBridge';
import { DesktopWindowControls } from '../components/DesktopWindowControls';
import { Divider } from '../components/Divider';
import { Icon, type IconName } from '../components/icons';
import { PreviewPanel } from '../components/PreviewPanel';
import { LocaleToggle } from '../components/TopBar';
import { TopBarIconButton } from '../components/TopBarIconButton';
import { useT } from '../i18n/locale';
import {
  appendReviewReply,
  createReviewComment,
  removeReviewComment,
  reviewAnchor,
  setReviewResolved,
  type ReviewComment,
} from '../review/reviewModel';
import { loadReviewComments, saveReviewComments } from '../review/reviewStore';
import { invokeAction } from '../shortcuts/actionRegistry';
import { theme, themeAlpha } from '../theme';
import type { Tpl } from '../types';
import { AppToastHost } from '../ui/AppToastHost';
import type { EditorWorkspaceViewProps } from './EditorWorkspaceView';
import type { EditorCommands } from './storeCommands';
import { timelineTrackIds, trackAlias, trackKind, type BlurRegion, type TimelineItem, type TimelineState } from './types';
import { BlurCanvasOverlay } from '../components/preview/BlurCanvasOverlay';
import { ExportDialog } from './workspaceDialogs';
import { useWorkspaceDialogPrefetch } from './workspaceDialogLoaders';

type SidebarTab = 'properties' | 'comments';

function formatTimecode(frame: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const clamped = Math.max(0, Math.round(frame));
  const totalSeconds = Math.floor(clamped / safeFps);
  const ff = clamped % safeFps;
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

function usePlayerPlayhead(playerRef: RefObject<PlayerRef | null>): {
  frame: number;
  playing: boolean;
  seekTo: (targetFrame: number) => void;
  togglePlay: () => void;
} {
  const [frame, setFrame] = useState(() => Math.round(playerRef.current?.getCurrentFrame() ?? 0));
  const [playing, setPlaying] = useState(() => Boolean(playerRef.current?.isPlaying()));

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    const onFrame = (event: { detail: { frame: number } }) => {
      setFrame(Math.round(event.detail.frame));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    setFrame(Math.round(player.getCurrentFrame()));
    setPlaying(player.isPlaying());
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [playerRef]);

  const seekTo = useCallback((targetFrame: number) => {
    const clamped = Math.max(0, Math.round(targetFrame));
    setFrame(clamped);
    playerRef.current?.seekTo(clamped);
  }, [playerRef]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying()) player.pause();
    else player.play();
  }, [playerRef]);

  return { frame, playing, seekTo, togglePlay };
}

function useSimpleComments(projectId: string) {
  const t = useT();
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setError('');
    loadReviewComments(projectId)
      .then((loaded) => {
        if (!cancelled) setComments(loaded);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t('评论加载失败'));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, t]);

  const commit = useCallback(async (next: ReviewComment[]) => {
    setBusy(true);
    setError('');
    try {
      await saveReviewComments(projectId, next);
      setComments(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('评论保存失败'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [projectId, t]);

  return { comments, busy, error, commit };
}

interface SimpleTopBarProps {
  projectId: string;
  projectName: string;
  canUndo: boolean;
  canRedo: boolean;
  exporting?: boolean;
  exportJobCount?: number;
  onHome?: () => void;
  onRename?: (name: string) => void;
}

function SimpleTopBar({
  projectId,
  projectName,
  canUndo,
  canRedo,
  exporting,
  exportJobCount = 0,
  onHome,
  onRename,
}: SimpleTopBarProps) {
  const t = useT();
  const isMacDesktop = window.openChatCutDesktop?.platform === 'darwin';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);

  const commitRename = () => {
    setEditing(false);
    if (onRename && draft.trim() && draft.trim() !== projectName) {
      onRename(draft.trim());
    }
  };

  return (
    <header
      className={`cc-topbar cc-window-titlebar${isMacDesktop ? ' cc-window-titlebar--mac' : ''}`}
      style={{
        gridColumn: '1 / -1',
        gridRow: 1,
        position: 'relative',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        borderBottom: `0.5px solid ${theme.border}`,
        background: theme.panel,
        gap: 8,
      }}
    >
      <DesktopWindowControls />
      <button
        type="button"
        className="cc-tip"
        data-tip={t('返回工程列表')}
        aria-label={t('返回工程列表')}
        onClick={onHome}
        style={{
          width: 30,
          height: 30,
          background: 'none',
          border: 'none',
          borderRadius: 6,
          cursor: onHome ? 'pointer' : 'default',
          padding: 0,
          display: 'grid',
          placeItems: 'center',
          color: theme.textDim,
        }}
      >
        <Icon name="home" size={16} />
      </button>
      <span style={{ width: 1, height: 18, background: theme.border }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 7px',
          borderRadius: 999,
          background: themeAlpha.accent(0.14),
          color: theme.accent,
        }}
      >
        {t('简洁版')}
      </span>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: theme.text,
        }}
      >
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              font: 'inherit',
              fontSize: 13,
              textAlign: 'center',
              background: theme.panelAlt,
              color: theme.text,
              border: `1px solid ${theme.accent}`,
              borderRadius: 6,
              padding: '3px 10px',
              minWidth: 200,
            }}
          />
        ) : (
          <span
            onDoubleClick={() => {
              if (onRename) {
                setDraft(projectName);
                setEditing(true);
              }
            }}
            title={onRename ? t('双击重命名') : undefined}
            style={{ cursor: onRename ? 'text' : 'default' }}
          >
            {projectName}
          </span>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <TopBarIconButton
          icon="undo"
          label={t('撤销')}
          onClick={() => invokeAction('undo', undefined, 'toolbar')}
          disabled={!canUndo}
        />
        <TopBarIconButton
          icon="redo"
          label={t('重做')}
          onClick={() => invokeAction('redo', undefined, 'toolbar')}
          disabled={!canRedo}
        />
        <LocaleToggle />
        <button
          type="button"
          onClick={() => {
            window.location.hash = `#/editor/${projectId}`;
          }}
          title="الواجهة الاحترافية"
          aria-label="الواجهة الاحترافية"
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: `0.5px solid ${theme.border}`,
            background: theme.panelAlt,
            color: theme.text,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="layoutPanel" size={13} />
          <span>الواجهة الاحترافية</span>
        </button>
        <button
          type="button"
          onClick={() => invokeAction('open-export', undefined, 'toolbar')}
          title={exporting ? t('查看后台导出任务') : t('导出 MP4')}
          aria-label={exporting ? t('查看后台导出任务') : t('导出 MP4')}
          style={{
            height: 28,
            padding: '0 14px',
            borderRadius: 6,
            border: 'none',
            background: theme.accent,
            color: theme.onAccent,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="download" size={13} />
          <span>{exporting ? t('{n} 个导出', { n: Math.max(1, exportJobCount) }) : t('导出 MP4')}</span>
        </button>
      </div>
    </header>
  );
}

interface ScreenPositionControlsProps {
  item: TimelineItem;
  canvasWidth: number;
  canvasHeight: number;
  commands: EditorCommands;
}

function ScreenPositionControls({
  item,
  canvasWidth,
  canvasHeight,
  commands,
}: ScreenPositionControlsProps) {
  const t = useT();
  const x = Math.round(item.transform?.x ?? 0);
  const y = Math.round(item.transform?.y ?? 0);
  const scalePct = Math.round((item.transform?.scale ?? 1) * 100);

  const presets: ReadonlyArray<{ label: string; rx: number; ry: number }> = [
    { label: t('左上'), rx: -0.3, ry: -0.3 },
    { label: t('上中'), rx: 0, ry: -0.3 },
    { label: t('右上'), rx: 0.3, ry: -0.3 },
    { label: t('左中'), rx: -0.3, ry: 0 },
    { label: t('居中'), rx: 0, ry: 0 },
    { label: t('右中'), rx: 0.3, ry: 0 },
    { label: t('左下'), rx: -0.3, ry: 0.3 },
    { label: t('下中'), rx: 0, ry: 0.3 },
    { label: t('右下'), rx: 0.3, ry: 0.3 },
  ];

  const applyTransform = (patch: { x?: number; y?: number; scale?: number; rotation?: number }) => {
    commands.setItemTransform(item.id, patch);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        borderRadius: 8,
        background: theme.panelAlt,
        border: `0.5px solid ${theme.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: theme.text }}>
          {t('屏幕位置与大小')}
        </span>
        <button
          type="button"
          onClick={() => applyTransform({ x: 0, y: 0, scale: 1, rotation: 0 })}
          style={{
            border: `0.5px solid ${theme.border}`,
            background: 'transparent',
            color: theme.textDim,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 10.5,
            cursor: 'pointer',
          }}
        >
          {t('重置位置')}
        </button>
      </div>

      <div>
        <div style={{ fontSize: 10.5, color: theme.textDim, marginBottom: 6 }}>
          {t('九宫格快速定位')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 5,
          }}
        >
          {presets.map((preset) => {
            const targetX = Math.round(preset.rx * canvasWidth);
            const targetY = Math.round(preset.ry * canvasHeight);
            const active = Math.abs(x - targetX) <= 12 && Math.abs(y - targetY) <= 12;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyTransform({ x: targetX, y: targetY })}
                style={{
                  height: 26,
                  borderRadius: 5,
                  border: `0.5px solid ${active ? theme.accent : theme.border}`,
                  background: active ? themeAlpha.accent(0.18) : theme.bg,
                  color: active ? theme.accent : theme.textDim,
                  fontSize: 10.5,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <label style={sliderRowStyle}>
        <span style={sliderLabelStyle}>{t('水平位置 X')}</span>
        <input
          type="range"
          min={-canvasWidth}
          max={canvasWidth}
          step={1}
          value={x}
          onChange={(e) => applyTransform({ x: Number(e.target.value) })}
          style={{ flex: 1, minWidth: 0 }}
        />
        <input
          type="number"
          value={x}
          onChange={(e) => applyTransform({ x: Number(e.target.value) || 0 })}
          style={numberInputStyle}
        />
      </label>

      <label style={sliderRowStyle}>
        <span style={sliderLabelStyle}>{t('垂直位置 Y')}</span>
        <input
          type="range"
          min={-canvasHeight}
          max={canvasHeight}
          step={1}
          value={y}
          onChange={(e) => applyTransform({ y: Number(e.target.value) })}
          style={{ flex: 1, minWidth: 0 }}
        />
        <input
          type="number"
          value={y}
          onChange={(e) => applyTransform({ y: Number(e.target.value) || 0 })}
          style={numberInputStyle}
        />
      </label>

      <label style={sliderRowStyle}>
        <span style={sliderLabelStyle}>{t('缩放比例')}</span>
        <input
          type="range"
          min={10}
          max={300}
          step={1}
          value={scalePct}
          onChange={(e) => applyTransform({ scale: Number(e.target.value) / 100 })}
          style={{ flex: 1, minWidth: 0 }}
        />
        <input
          type="number"
          min={10}
          max={400}
          value={scalePct}
          onChange={(e) => applyTransform({ scale: Math.max(0.1, (Number(e.target.value) || 100) / 100) })}
          style={numberInputStyle}
        />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
        <span style={{ fontSize: 10.5, color: theme.textDim }}>{t('时间与轨道微调')}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            title={t('左移 1 帧')}
            aria-label={t('左移 1 帧')}
            onClick={() => commands.setItemTiming(item.id, { startFrame: Math.max(0, item.startFrame - 1) })}
            style={nudgeBtnStyle}
          >
            -1f
          </button>
          <button
            type="button"
            title={t('右移 1 帧')}
            aria-label={t('右移 1 帧')}
            onClick={() => commands.setItemTiming(item.id, { startFrame: item.startFrame + 1 })}
            style={nudgeBtnStyle}
          >
            +1f
          </button>
          <button
            type="button"
            title={t('缩短 1 帧')}
            aria-label={t('缩短 1 帧')}
            onClick={() => commands.setItemTiming(item.id, { durationInFrames: Math.max(1, item.durationInFrames - 1) })}
            style={nudgeBtnStyle}
          >
            -Dur
          </button>
          <button
            type="button"
            title={t('延长 1 帧')}
            aria-label={t('延长 1 帧')}
            onClick={() => commands.setItemTiming(item.id, { durationInFrames: item.durationInFrames + 1 })}
            style={nudgeBtnStyle}
          >
            +Dur
          </button>
        </div>
      </div>
    </div>
  );
}

function volumePctToSliderPos(vol: number): number {
  const clamped = Math.max(0, Math.min(150, vol));
  if (clamped <= 100) {
    return Math.round((clamped / 100) * 50);
  } else {
    return Math.round(50 + ((clamped - 100) / 50) * 50);
  }
}

function sliderPosToVolumePct(pos: number): number {
  const clamped = Math.max(0, Math.min(100, pos));
  if (clamped <= 50) {
    return Math.round((clamped / 50) * 100);
  } else {
    return Math.round(100 + ((clamped - 50) / 50) * 50);
  }
}

interface SimplePropertiesPaneProps {
  state: TimelineState;
  templates: readonly Tpl[];
  commands: EditorCommands;
  selectedItem: TimelineItem | null;
  selectedCaption: NonNullable<EditorWorkspaceViewProps['inspectorPanel']>['selectedCaption'];
  onSeek: (frame: number) => void;
  blurRegions: BlurRegion[];
  selectedBlurId: string | null;
  onSelectBlur: (id: string | null) => void;
  onAddBlur: () => void;
  onRemoveBlur: (id: string) => void;
}

function SimplePropertiesPane({
  state,
  templates: _templates,
  commands,
  selectedItem,
  selectedCaption: _selectedCaption,
  onSeek,
  blurRegions,
  selectedBlurId,
  onSelectBlur,
  onAddBlur,
  onRemoveBlur,
}: SimplePropertiesPaneProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    texts: true,
    location_source: true,
    captions: true,
    video_audio: true,
    blur: true,
    music: true,
    position: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 1. Identify primary items on the timeline
  const headlineItem = useMemo(
    () =>
      state.items.find(
        (it) =>
          it.kind === 'motion-graphic' &&
          (it.props?.line1Text !== undefined ||
            it.name.toLowerCase().includes('headline') ||
            it.templateId?.includes('headline'))
      ) ?? state.items.find((it) => it.kind === 'motion-graphic'),
    [state.items]
  );

  const standaloneLocationItem = useMemo(
    () =>
      state.items.find(
        (it) =>
          it.kind === 'motion-graphic' &&
          it.name.toLowerCase().includes('location') &&
          !it.name.toLowerCase().includes('headline')
      ),
    [state.items]
  );

  const sourceItem = useMemo(
    () =>
      state.items.find(
        (it) =>
          it.kind === 'motion-graphic' &&
          (it.name.toLowerCase().includes('source') ||
            it.templateId?.includes('source') ||
            (it.props?.sourceText !== undefined && !it.name.toLowerCase().includes('headline')))
      ) ??
      state.items.find(
        (it) =>
          it.name.toLowerCase().includes('source') ||
          it.props?.sourceText !== undefined
      ),
    [state.items]
  );

  const videoItem = useMemo(
    () => state.items.find((it) => it.kind === 'video'),
    [state.items]
  );

  const audioTracks = useMemo(
    () => timelineTrackIds(state).filter((id) => trackKind(state, id) === 'audio'),
    [state]
  );
  const a2TrackId = audioTracks[1];

  // Music presets (Exclusive list of 14 WAV sound tracks)
  const MUSIC_OPTIONS = useMemo(
    () => [
      { id: 'mus_aggressor', name: 'Aggressor (حماسي قوي)', src: '/audio/aggressor.wav' },
      { id: 'mus_chasing_time', name: 'Chasing Time (إيقاع تشويقي وسريع)', src: '/audio/chasing-time.wav' },
      { id: 'mus_clouds', name: 'Clouds (هادئ وتأملي)', src: '/audio/clouds.wav' },
      { id: 'mus_conflict', name: 'Conflict (توتر ونزاع إخباري)', src: '/audio/conflict.wav' },
      { id: 'mus_criminal_elements', name: 'Criminal Elements (غموض وتحقيق)', src: '/audio/criminal-elements.wav' },
      { id: 'mus_devastation', name: 'Devastation (درامي تراجيدي حزين)', src: '/audio/devastation.wav' },
      { id: 'mus_digital_dust', name: 'Digital Dust (تقني عصري خفيف)', src: '/audio/digital-dust.wav' },
      { id: 'mus_disaster', name: 'Disaster (كارثة وتصاعد طوارئ)', src: '/audio/disaster.wav' },
      { id: 'mus_follow_that_car', name: 'Follow That Car (مطاردة وحركة سريعة)', src: '/audio/follow-that-car.wav' },
      { id: 'mus_night_living_dead', name: 'Night Of The Living Dead (ريلز قصير وتفاعلي)', src: '/audio/night-of-the-living-dead.wav' },
      { id: 'mus_oceanside', name: 'Oceanside (موسيقى هادئة ووثائقية)', src: '/audio/oceanside.wav' },
      { id: 'mus_battle_1066', name: 'The Battle of 1066 (ملحمي حماسي)', src: '/audio/the-battle-of-1066.wav' },
      { id: 'mus_final_frame', name: 'The Final Frame (نهاية درامية)', src: '/audio/the-final-frame.wav' },
      { id: 'mus_unsettling', name: 'Unsettling (قلق وترقب شديد)', src: '/audio/unsettling.wav' },
    ],
    []
  );

  // Restore video volume if it was set to 0 by previous auto-mute bug
  const didRestoreVideoRef = useRef(false);
  useEffect(() => {
    if (!didRestoreVideoRef.current && videoItem && (videoItem.volume === 0 || videoItem.volume === undefined)) {
      commands.setItemVolume(videoItem.id, 1);
      didRestoreVideoRef.current = true;
    }
  }, [videoItem, commands]);

  // Restore outro audio volume if it was silenced to 0
  useEffect(() => {
    state.items
      .filter(
        (it) =>
          it.kind === 'audio' &&
          (it.name.toLowerCase().includes('outro') || it.id.toLowerCase().includes('outro'))
      )
      .forEach((outroAudio) => {
        if ((outroAudio.volume ?? 1) === 0) {
          commands.setItemVolume(outroAudio.id, 1);
        }
      });
  }, [state.items, commands]);

  // Silence ONLY the companion audio clip on A1 that duplicates the main video clip's audio (e.g. videoItem),
  // NEVER silence the outro audio or music!
  useEffect(() => {
    state.items
      .filter(
        (it) =>
          it.kind === 'audio' &&
          it.track !== a2TrackId &&
          it.track !== 'A2' &&
          !it.name.toLowerCase().includes('outro') &&
          !it.id.toLowerCase().includes('outro') &&
          !it.name.toLowerCase().includes('.wav') &&
          (it.src?.endsWith('.mp4') || (videoItem && it.name.includes(videoItem.name)))
      )
      .forEach((dup) => {
        if ((dup.volume ?? 1) > 0) {
          commands.setItemVolume(dup.id, 0);
        }
      });
  }, [state.items, a2TrackId, videoItem, commands]);

  // Clean up any music clips mistakenly placed on A1 in previous sessions
  useEffect(() => {
    const misplaced = state.items.filter(
      (it) =>
        it.kind === 'audio' &&
        it.track !== a2TrackId &&
        it.track !== 'A2' &&
        (it.name.toLowerCase().includes('.wav') ||
          MUSIC_OPTIONS.some((opt) => opt.id === it.id || opt.name === it.name || opt.src === it.src))
    );
    if (misplaced.length > 0) {
      misplaced.forEach((m) => commands.removeItem(m.id));
    }
  }, [state.items, a2TrackId, commands, MUSIC_OPTIONS]);

  const musicItem = useMemo(
    () =>
      state.items.find(
        (it) =>
          it.kind === 'audio' &&
          (it.track === a2TrackId ||
            it.track === 'A2' ||
            it.name.toLowerCase().includes('.wav') ||
            MUSIC_OPTIONS.some((opt) => opt.id === it.id || opt.name === it.name || opt.src === it.src))
      ),
    [state.items, a2TrackId, MUSIC_OPTIONS]
  );

  // Values
  const line1 = String(headlineItem?.props?.line1Text ?? '');
  const line2 = String(headlineItem?.props?.line2Text ?? '');

  // Location Visibility & Value
  const locationRaw = String(headlineItem?.props?.locationText ?? '');
  const savedLocation = String(headlineItem?.props?._savedLocationText ?? '');
  const locationDisplay = locationRaw || savedLocation || (standaloneLocationItem ? String(standaloneLocationItem.props?.locationText ?? '') : '');

  const isLocationVisible = standaloneLocationItem
    ? (standaloneLocationItem.transform?.opacity ?? 1) > 0
    : Boolean(headlineItem?.props?.showLocation !== false && headlineItem?.props?.locationText);

  // Source Visibility & Value
  const sourceRaw = String(sourceItem?.props?.sourceText ?? headlineItem?.props?.sourceText ?? '');
  const savedSource = String(sourceItem?.props?._savedSourceText ?? headlineItem?.props?._savedSourceText ?? '');
  const sourceDisplay = sourceRaw || savedSource;

  const isSourceVisible = sourceItem
    ? (sourceItem.transform?.opacity ?? 1) > 0 &&
      sourceItem.props?.showSource !== false &&
      Boolean(sourceItem.props?.sourceText !== '')
    : Boolean(headlineItem?.props?.showSource !== false && headlineItem?.props?.sourceText);

  const isCaptionsVisible = state.captionsHidden !== true;

  // Video Volume (controls video clips on V1 directly)
  const currentVideoVol = videoItem ? (videoItem.volume ?? 1) : 1;
  const isVideoMuted = currentVideoVol === 0;
  const videoVolume = Math.round(currentVideoVol * 100);

  // Music Volume & Mute state
  const currentMusicVol = musicItem ? (musicItem.volume ?? 0.3) : 0.3;
  const musicVolume = Math.round(currentMusicVol * 100);
  const isMusicMuted = musicItem ? (musicItem.volume ?? 0.3) === 0 : false;

  // Ensure background music on A2 automatically gets smooth fade-out (2 seconds) on creation
  useEffect(() => {
    if (musicItem && (musicItem.fadeOutFrames === undefined || musicItem.fadeOutFrames === 0)) {
      commands.setItemFade(musicItem.id, { fadeOutFrames: Math.round(state.fps * 2) });
    }
  }, [musicItem, state.fps, commands]);

  const currentMusicId = useMemo(() => {
    if (!musicItem) return '';
    const match = MUSIC_OPTIONS.find(
      (m) =>
        m.src === musicItem.src ||
        m.id === musicItem.id ||
        (musicItem.src && musicItem.src.includes(m.src.split('/').pop()?.replace('.wav', '') ?? '___')) ||
        (musicItem.name && musicItem.name.toLowerCase().includes(m.id.replace('mus_', '').replace(/_/g, ' '))) ||
        (musicItem.name && musicItem.name.toLowerCase().includes(m.name.split(' ')[0]!.toLowerCase()))
    );
    return match ? match.id : musicItem.id || '';
  }, [musicItem, MUSIC_OPTIONS]);

  // Actions
  const RED_URGENT_COLOR = '#F22D2D';

  const isUrgent = Boolean(
    headlineItem?.props?.isUrgent === true ||
      String(headlineItem?.props?.line2BgColor).toUpperCase().includes('F22D2D') ||
      String(headlineItem?.props?.accentColor).toUpperCase().includes('F22D2D') ||
      headlineItem?.props?.colorTheme === 'urgent'
  );

  const toggleUrgent = () => {
    if (!headlineItem) return;
    const nextUrgent = !isUrgent;
    const targetItems = state.items.filter(
      (it) =>
        it.kind === 'motion-graphic' &&
        (it.id === headlineItem.id ||
          it.props?.line1Text !== undefined ||
          it.props?.line2Text !== undefined ||
          it.name.toLowerCase().includes('headline'))
    );

    if (nextUrgent) {
      targetItems.forEach((item) => {
        const rawLine2 = item.props?.line2BgColor as string | undefined;
        const rawAccent = item.props?.accentColor as string | undefined;
        const backupLine2 =
          item.props?._originalLine2BgColor ||
          (rawLine2 && !rawLine2.toUpperCase().includes('F22D2D') ? rawLine2 : undefined);
        const backupAccent =
          item.props?._originalAccentColor ||
          (rawAccent && !rawAccent.toUpperCase().includes('F22D2D') ? rawAccent : undefined);

        commands.updateItemProps(item.id, {
          isUrgent: true,
          colorTheme: 'urgent',
          line2BgColor: RED_URGENT_COLOR,
          accentColor: RED_URGENT_COLOR,
          accentTabColor: RED_URGENT_COLOR,
          topBgColor: RED_URGENT_COLOR,
          _originalLine2BgColor: backupLine2,
          _originalAccentColor: backupAccent,
        });
      });
    } else {
      targetItems.forEach((item) => {
        const restoredLine2 = item.props?._originalLine2BgColor;
        const restoredAccent = item.props?._originalAccentColor;

        commands.updateItemProps(item.id, {
          isUrgent: false,
          colorTheme: 'normal',
          line2BgColor: restoredLine2 !== undefined ? restoredLine2 : undefined,
          accentColor: restoredAccent !== undefined ? restoredAccent : undefined,
          accentTabColor: restoredAccent !== undefined ? restoredAccent : undefined,
          topBgColor: undefined,
        });
      });
    }
  };

  const updateHeadline = (key: string, val: unknown) => {
    if (headlineItem) {
      commands.updateItemProps(headlineItem.id, { [key]: val });
    }
  };

  const updateLocationText = (val: string) => {
    if (headlineItem) {
      commands.updateItemProps(headlineItem.id, {
        locationText: isLocationVisible ? val : '',
        _savedLocationText: val,
      });
    }
    if (standaloneLocationItem) {
      commands.updateItemProps(standaloneLocationItem.id, {
        locationText: val,
      });
    }
  };

  const toggleLocation = () => {
    const nextVisible = !isLocationVisible;
    if (standaloneLocationItem) {
      commands.setItemTransform(standaloneLocationItem.id, {
        ...standaloneLocationItem.transform,
        opacity: nextVisible ? 1 : 0,
      });
    }
    if (headlineItem) {
      const activeText = nextVisible
        ? (headlineItem.props?._savedLocationText as string) || locationDisplay || 'القاهرة'
        : '';
      const backupText = (headlineItem.props?.locationText as string) || locationDisplay || 'القاهرة';
      commands.updateItemProps(headlineItem.id, {
        showLocation: nextVisible,
        locationText: activeText,
        _savedLocationText: backupText,
      });
    }
  };

  const updateSourceText = (text: string) => {
    if (sourceItem) {
      commands.updateItemProps(sourceItem.id, {
        sourceText: isSourceVisible ? text : '',
        _savedSourceText: text,
      });
    }
    if (headlineItem && headlineItem.props?.sourceText !== undefined) {
      commands.updateItemProps(headlineItem.id, {
        sourceText: isSourceVisible ? text : '',
        _savedSourceText: text,
      });
    }
  };

  const toggleSource = () => {
    const nextVisible = !isSourceVisible;
    if (sourceItem) {
      const activeText = nextVisible
        ? (sourceItem.props?._savedSourceText as string) || sourceDisplay || '@المصدر'
        : '';
      const backupText = (sourceItem.props?.sourceText as string) || sourceDisplay || '@المصدر';
      commands.setItemTransform(sourceItem.id, {
        ...sourceItem.transform,
        opacity: nextVisible ? 1 : 0,
      });
      commands.updateItemProps(sourceItem.id, {
        showSource: nextVisible,
        enableEntrance: nextVisible,
        sourceText: activeText,
        _savedSourceText: backupText,
      });
    }
    if (headlineItem) {
      const activeText = nextVisible
        ? (headlineItem.props?._savedSourceText as string) || sourceDisplay || '@المصدر'
        : '';
      const backupText = (headlineItem.props?.sourceText as string) || sourceDisplay || '@المصدر';
      commands.updateItemProps(headlineItem.id, {
        showSource: nextVisible,
        sourceText: activeText,
        _savedSourceText: backupText,
      });
    }
  };

  const setVideoVolume = (vol: number) => {
    state.items
      .filter((it) => it.kind === 'video')
      .forEach((v) => {
        commands.setItemVolume(v.id, vol);
      });
  };

  const toggleVideoMute = () => {
    const nextVol = isVideoMuted ? 1 : 0;
    setVideoVolume(nextVol);
  };

  const setMusicVolume = (vol: number) => {
    if (!musicItem) return;
    commands.setItemVolume(musicItem.id, vol);
  };

  const toggleMusicMute = () => {
    if (!musicItem) return;
    if (isMusicMuted) {
      commands.setItemVolume(musicItem.id, 0.3);
    } else {
      commands.setItemVolume(musicItem.id, 0);
    }
  };

  const handleSelectMusic = (presetId: string) => {
    const targetA2Id = a2TrackId ?? 'A2';

    // 1. Remove all existing background music clips anywhere on timeline
    state.items
      .filter(
        (it) =>
          it.kind === 'audio' &&
          (it.track === targetA2Id ||
            it.track === 'A2' ||
            it.name.toLowerCase().includes('.wav') ||
            MUSIC_OPTIONS.some((opt) => opt.id === it.id || opt.name === it.name || opt.src === it.src))
      )
      .forEach((it) => commands.removeItem(it.id));

    if (!presetId) return;

    const opt = MUSIC_OPTIONS.find((o) => o.id === presetId);
    if (!opt) return;

    // Calculate music end: ends exactly when the original clip ends, before the outro begins
    const getOriginalContentEndFrame = () => {
      const outroItem = state.items.find(
        (it) => it.name.toLowerCase().includes('outro') || it.id.toLowerCase().includes('outro')
      );
      if (outroItem && outroItem.startFrame > 0) {
        return outroItem.startFrame;
      }
      const nonOutroVideos = state.items.filter(
        (it) => it.kind === 'video' && !it.name.toLowerCase().includes('outro')
      );
      if (nonOutroVideos.length > 0) {
        return Math.max(...nonOutroVideos.map((it) => it.startFrame + it.durationInFrames));
      }
      const nonOutroAudios = state.items.filter(
        (it) =>
          it.kind === 'audio' &&
          it.track !== targetA2Id &&
          it.track !== 'A2' &&
          !it.name.toLowerCase().includes('.wav') &&
          !it.name.toLowerCase().includes('outro')
      );
      if (nonOutroAudios.length > 0) {
        return Math.max(...nonOutroAudios.map((it) => it.startFrame + it.durationInFrames));
      }
      return Math.max(state.fps * 10, ...state.items.map((it) => it.startFrame + it.durationInFrames));
    };

    const musicDuration = getOriginalContentEndFrame();

    let finalTrack = a2TrackId;
    if (!finalTrack) {
      finalTrack = commands.createTrack('audio', { name: 'A2' });
    }

    commands.addAudio(
      {
        id: opt.id,
        name: opt.name,
        category: 'music',
        src: opt.src,
        durationInFrames: musicDuration,
      },
      { track: finalTrack ?? 'A2', startFrame: 0 }
    );
  };

  const fitMusicDuration = () => {
    if (!musicItem) return;
    const outroItem = state.items.find(
      (it) => it.name.toLowerCase().includes('outro') || it.id.toLowerCase().includes('outro')
    );
    let musicEnd: number;
    if (outroItem && outroItem.startFrame > 0) {
      musicEnd = outroItem.startFrame;
    } else {
      const nonOutroVideos = state.items.filter(
        (it) => it.kind === 'video' && !it.name.toLowerCase().includes('outro')
      );
      if (nonOutroVideos.length > 0) {
        musicEnd = Math.max(...nonOutroVideos.map((it) => it.startFrame + it.durationInFrames));
      } else {
        musicEnd = Math.max(state.fps * 10, ...state.items.map((it) => it.startFrame + it.durationInFrames));
      }
    }
    commands.updateItemProps(musicItem.id, { durationInFrames: musicEnd });
  };

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: theme.textDim,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 6,
    border: `0.5px solid ${theme.border}`,
    background: theme.bg,
    color: theme.text,
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'Cairo, Noto Sans Arabic, sans-serif',
    direction: 'rtl',
  };

  const toggleBtnStyle = (active: boolean): CSSProperties => ({
    height: 28,
    padding: '0 10px',
    borderRadius: 6,
    border: `0.5px solid ${active ? theme.accent : theme.border}`,
    background: active ? themeAlpha.accent(0.18) : theme.bg,
    color: active ? theme.accent : theme.textDim,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  });

  const renderCardHeader = (
    key: string,
    icon: IconName,
    title: string
  ) => {
    const isOpen = openSections[key];
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleSection(key)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSection(key);
          }
        }}
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          background: isOpen ? 'rgba(255, 255, 255, 0.025)' : 'transparent',
          borderBottom: isOpen ? `0.5px solid ${theme.border}` : 'none',
          transition: 'background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'grid',
              placeItems: 'center',
              color: isOpen ? theme.accent : theme.textDim,
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: isOpen ? themeAlpha.accent(0.16) : 'rgba(255, 255, 255, 0.05)',
              color: isOpen ? theme.accent : theme.textDim,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <Icon name={icon} size={13} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
            {title}
          </span>
        </div>
      </div>
    );
  };

  const cardContainerStyle = (isOpen: boolean): CSSProperties => ({
    flexShrink: 0,
    borderRadius: 10,
    background: theme.panelAlt,
    border: `0.5px solid ${isOpen ? theme.border : 'rgba(255, 255, 255, 0.08)'}`,
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  });

  return (
    <div
      dir="rtl"
      className="cc-simple-properties-pane"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        overflowY: 'auto',
        flex: 1,
        minHeight: 0,
        fontFamily: 'Cairo, Noto Sans Arabic, system-ui, sans-serif',
        textAlign: 'right',
      }}
    >
      {/* 1. النصوص والعناوين */}
      <div style={cardContainerStyle(openSections.texts)}>
        {renderCardHeader(
          'texts',
          'text',
          'النصوص والعناوين'
        )}

        {openSections.texts && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {/* نمط القالب (لون قالب عادي / قالب عاجل) */}
            <div
              role="button"
              tabIndex={0}
              onClick={toggleUrgent}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleUrgent();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                borderRadius: 8,
                background: isUrgent ? 'rgba(242, 45, 45, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${isUrgent ? '#F22D2D' : theme.border}`,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>لون القالب:</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: isUrgent ? '#F22D2D' : theme.text,
                  }}
                >
                  {isUrgent ? 'قالب عاجل (أحمر #F22D2D)' : 'لون قالب عادي'}
                </span>
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 12px',
                  borderRadius: 6,
                  background: isUrgent ? '#F22D2D' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${isUrgent ? '#F22D2D' : 'rgba(255, 255, 255, 0.2)'}`,
                  color: isUrgent ? '#ffffff' : theme.textDim,
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: isUrgent ? '0 2px 10px rgba(242, 45, 45, 0.45)' : 'none',
                  transition: 'all 0.18s ease',
                }}
              >
                {/* المربع */}
                <div
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 3.5,
                    border: `1.5px solid ${isUrgent ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'}`,
                    background: isUrgent ? '#ffffff' : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isUrgent && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F22D2D" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span>عاجل</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                <span>السطر الأول (العنوان الرئيسي)</span>
              </label>
              <input
                type="text"
                value={line1}
                placeholder="اكتب العنوان الرئيسي هنا..."
                onChange={(e) => updateHeadline('line1Text', e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>
                <span>السطر الثاني (العنوان الفرعي)</span>
              </label>
              <input
                type="text"
                value={line2}
                placeholder="اكتب السطر الثاني هنا..."
                onChange={(e) => updateHeadline('line2Text', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. الموقع الجغرافي والمصدر */}
      <div style={cardContainerStyle(openSections.location_source)}>
        {renderCardHeader(
          'location_source',
          'bookmark',
          'الموقع الجغرافي والمصدر'
        )}

        {openSections.location_source && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <div style={labelStyle}>
                <span>الموقع الجغرافي</span>
                <button
                  type="button"
                  onClick={toggleLocation}
                  style={toggleBtnStyle(isLocationVisible)}
                >
                  <Icon name={isLocationVisible ? 'eye' : 'eyeOff'} size={12} />
                  <span>{isLocationVisible ? 'ظاهر' : 'مخفي'}</span>
                </button>
              </div>
              <input
                type="text"
                value={locationDisplay}
                placeholder="اسم المدينة أو الدولة..."
                onChange={(e) => updateLocationText(e.target.value)}
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </div>

            <div>
              <div style={labelStyle}>
                <span>المصدر أو الحساب (@)</span>
                <button
                  type="button"
                  onClick={toggleSource}
                  style={toggleBtnStyle(isSourceVisible)}
                >
                  <Icon name={isSourceVisible ? 'eye' : 'eyeOff'} size={12} />
                  <span>{isSourceVisible ? 'ظاهر' : 'مخفي'}</span>
                </button>
              </div>
              <input
                type="text"
                value={sourceDisplay}
                placeholder="@المصدر"
                onChange={(e) => updateSourceText(e.target.value)}
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. الترجمة والكابشن */}
      <div style={cardContainerStyle(openSections.captions)}>
        {renderCardHeader('captions', 'captions', 'الترجمة والكابشن')}

        {openSections.captions && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>عرض الكابشن على الفيديو</span>
              <button
                type="button"
                onClick={() => commands.setCaptionsHidden(!isCaptionsVisible)}
                style={toggleBtnStyle(isCaptionsVisible)}
              >
                <Icon name={isCaptionsVisible ? 'eye' : 'eyeOff'} size={12} />
                <span>{isCaptionsVisible ? 'الترجمة مفعلة' : 'الترجمة مخفية'}</span>
              </button>
            </div>
            <div style={{ fontSize: 11, color: theme.textDim, lineHeight: 1.5 }}>
              {isCaptionsVisible
                ? 'الترجمة معروضة فوق الفيديو مع مراعاة التزامن الصوتي التام.'
                : 'تم إخفاء الترجمة من على شاشة الفيديو بالكامل.'}
            </div>
          </div>
        )}
      </div>

      {/* 4. صوت الفيديو الأصلي */}
      <div style={cardContainerStyle(openSections.video_audio)}>
        {renderCardHeader('video_audio', 'video', 'صوت الفيديو الأصلي')}

        {openSections.video_audio && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {videoItem ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>التحكم في الصوت</span>
                  <button
                    type="button"
                    onClick={toggleVideoMute}
                    style={toggleBtnStyle(!isVideoMuted)}
                  >
                    <Icon name={!isVideoMuted ? 'volume' : 'volumeOff'} size={12} />
                    <span>{!isVideoMuted ? 'صوت مسموع' : 'صوت مكتوم'}</span>
                  </button>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: theme.textDim }}>مستوى علو الصوت</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {videoVolume > 120 && (
                        <span style={{ fontSize: 9.5, color: '#ef4444', fontWeight: 700, background: 'rgba(239, 68, 68, 0.12)', padding: '1px 5px', borderRadius: 4 }}>
                          تضخيم إضافي
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: videoVolume > 120 ? '#ef4444' : theme.text,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {videoVolume}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volumePctToSliderPos(videoVolume)}
                    onChange={(e) => setVideoVolume(sliderPosToVolumePct(Number(e.target.value)) / 100)}
                    style={{
                      width: '100%',
                      accentColor: videoVolume > 120 ? '#ef4444' : theme.accent,
                      cursor: 'pointer',
                    }}
                  />
                  {/* Notch scale labels in RTL */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: theme.textDim,
                      marginTop: 5,
                      userSelect: 'none',
                    }}
                  >
                    <span>0%</span>
                    <button
                      type="button"
                      onClick={() => setVideoVolume(1)}
                      title="إعادة للوضع الطبيعي (100%)"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 10,
                        cursor: 'pointer',
                        fontWeight: videoVolume === 100 ? 700 : 500,
                        color: videoVolume === 100 ? theme.accent : theme.textDim,
                        textDecoration: videoVolume === 100 ? 'underline' : 'none',
                      }}
                    >
                      100% (طبيعي)
                    </button>
                    <span style={{ color: videoVolume > 120 ? '#ef4444' : theme.textDim, fontWeight: videoVolume > 120 ? 700 : 500 }}>
                      150% (أقصى رفع)
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: theme.textDim }}>لا يوجد مقطع فيديو حالياً على التايم لاين.</div>
            )}
          </div>
        )}
      </div>

      {/* 5. تمويه الخصوصية (Blur) */}
      <div className="cc-blur-card-action" style={cardContainerStyle(openSections.blur)}>
        {renderCardHeader('blur', 'eyeOff', 'تمويه الخصوصية (Blur)')}

        {openSections.blur && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: theme.textDim, lineHeight: 1.5 }}>
                تمويه على الفيديو الأصلي فقط (النصوص والموشن جرافيكس والشعارات غير متأثرة 100%).
              </span>
            </div>

            <button
              type="button"
              onClick={onAddBlur}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 7,
                border: '1px solid rgba(59, 130, 246, 0.4)',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: '0 1px 4px rgba(37, 99, 235, 0.25)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#2563eb'; }}
            >
              <Icon name="plus" size={13} />
              <span>إضافة تمويه جديد (Blur)</span>
            </button>

            {blurRegions.length === 0 ? (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 7,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `0.5px dashed ${theme.border}`,
                  textAlign: 'center',
                  fontSize: 11,
                  color: theme.textDim,
                }}
              >
                لا توجد مربعات تمويه حالياً. اضغط "إضافة تمويه جديد" لوضع مربع على الشاشة.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 10.5, color: theme.textDim }}>
                  مربعات التمويه النشطة ({blurRegions.length}):
                </div>
                {blurRegions.map((region, idx) => {
                  const isSelected = selectedBlurId === region.id;
                  return (
                    <div
                      key={region.id}
                      onClick={() => onSelectBlur(region.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: `0.5px solid ${isSelected ? '#3b82f6' : theme.border}`,
                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : theme.bg,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="eyeOff" size={12} color={isSelected ? '#3b82f6' : theme.textDim} />
                        <span style={{ fontSize: 11.5, fontWeight: isSelected ? 700 : 500, color: theme.text }}>
                          تمويه {idx + 1}
                        </span>
                        <span style={{ fontSize: 10, color: theme.textDim }}>
                          ({Math.round(region.width)}% × {Math.round(region.height)}%)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveBlur(region.id);
                        }}
                        title="حذف مربع التمويه"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: theme.danger || '#ef4444',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: 4,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10, color: theme.textDim, marginTop: 2 }}>
                  * يمكنك سحب المربع من الشاشة مباشرة وتغيير حجمه من الزوايا.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. الموسيقى التصويرية والخلفية (A2) */}
      <div style={cardContainerStyle(openSections.music)}>
        {renderCardHeader('music', 'music', 'الموسيقى التصويرية والخلفية (A2)')}

        {openSections.music && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {musicItem && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: `0.5px solid ${theme.border}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>التحكم بالموسيقى الحالية</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    onClick={toggleMusicMute}
                    style={toggleBtnStyle(!isMusicMuted)}
                    title={isMusicMuted ? 'إلغاء كتم الموسيقى' : 'كتم صوت الموسيقى'}
                  >
                    <Icon name={!isMusicMuted ? 'volume' : 'volumeOff'} size={12} />
                    <span>{!isMusicMuted ? 'موسيقى مسموعة' : 'مكتومة'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectMusic('')}
                    style={{
                      height: 28,
                      padding: '0 8px',
                      borderRadius: 6,
                      border: `0.5px solid ${theme.border}`,
                      background: 'transparent',
                      color: theme.danger || '#ef4444',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Icon name="trash" size={11} />
                    <span>حذف</span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <label style={{ ...labelStyle, marginBottom: 5 }}>
                <span>اختيار الموسيقى</span>
              </label>
              <select
                value={currentMusicId}
                onChange={(e) => handleSelectMusic(e.target.value)}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  background: theme.bg,
                }}
              >
                <option value="">بدون موسيقى</option>
                {MUSIC_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {musicItem && (
              <>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: theme.textDim }}>علو صوت الموسيقى</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>
                      {musicVolume}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                    style={{ width: '100%', accentColor: theme.accent, cursor: 'pointer' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={fitMusicDuration}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 7,
                    border: `0.5px solid ${theme.border}`,
                    background: theme.panel,
                    color: theme.text,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <Icon name="fit" size={12} />
                  <span>ضبط طول الموسيقى مع نهاية المقطع الأصلي (قبل الأوترو)</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 6. خيارات الموضع المباشر وتفاصيل العناصر */}
      <div style={cardContainerStyle(openSections.position)}>
        {renderCardHeader(
          'position',
          'sliders',
          'خيارات الموضع المباشر وتفاصيل العناصر'
        )}

        {openSections.position && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ fontSize: 11, color: theme.textDim }}>
              اختر أي عنصر من التايم لاين لتعديل موضعه في الشبكة (9-Point):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {state.items
                .filter((it) => it.kind === 'motion-graphic' || it.kind === 'text' || it.kind === 'video')
                .map((it) => {
                  const isSelected = selectedItem?.id === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        commands.selectItem(it.id);
                        onSeek(it.startFrame);
                      }}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 6,
                        border: `0.5px solid ${isSelected ? theme.accent : theme.border}`,
                        background: isSelected ? themeAlpha.accent(0.2) : theme.bg,
                        color: isSelected ? theme.accent : theme.text,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {it.name}
                    </button>
                  );
                })}
            </div>

            {selectedItem && (
              <ScreenPositionControls
                item={selectedItem}
                canvasWidth={state.width}
                canvasHeight={state.height}
                commands={commands}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface SimpleCommentsPaneProps {
  timelineId: string;
  state: TimelineState;
  selectedItem: TimelineItem | null;
  playheadFrame: number;
  comments: ReviewComment[];
  busy: boolean;
  error: string;
  commit: (next: ReviewComment[]) => Promise<boolean>;
  onSeek: (frame: number) => void;
  onSelectItem: (id: string | null) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}

function SimpleCommentsPane({
  timelineId,
  state,
  selectedItem,
  playheadFrame,
  comments,
  busy,
  error,
  commit,
  onSeek,
  onSelectItem,
  composerRef,
}: SimpleCommentsPaneProps) {
  const t = useT();
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.anchor.frame - b.anchor.frame),
    [comments],
  );

  const handleAdd = async () => {
    if (!text.trim() || busy) return;
    const anchor = reviewAnchor(timelineId, playheadFrame, state, selectedItem);
    const saved = await commit([...comments, createReviewComment(anchor, text)]);
    if (saved) setText('');
  };

  const handleReply = async (commentId: string) => {
    if (!replyText.trim() || busy) return;
    const saved = await commit(appendReviewReply(comments, commentId, replyText));
    if (saved) {
      setReplyText('');
      setReplyingTo(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: 12, borderBottom: `0.5px solid ${theme.border}`, background: theme.panelAlt }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: theme.textDim }}>
          <span>
            {t('时间线')}: <strong style={{ color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{formatTimecode(playheadFrame, state.fps)}</strong>
          </span>
          {selectedItem && (
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('片段')}: {selectedItem.name}
            </span>
          )}
        </div>
        <textarea
          ref={composerRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder={t('在当前帧添加审阅评论')}
          style={{
            width: '100%',
            minHeight: 60,
            resize: 'vertical',
            boxSizing: 'border-box',
            border: `0.5px solid ${theme.border}`,
            borderRadius: 6,
            background: theme.bg,
            color: theme.text,
            padding: '8px 10px',
            font: 'inherit',
            fontSize: 12,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void handleAdd()}
            style={{
              border: 'none',
              borderRadius: 5,
              padding: '6px 12px',
              background: theme.accent,
              color: theme.onAccent,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: busy || !text.trim() ? 'default' : 'pointer',
              opacity: busy || !text.trim() ? 0.5 : 1,
            }}
          >
            {t('添加评论')}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortedComments.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: theme.textDim, fontSize: 12 }}>
            {t('还没有审阅评论')}
          </div>
        )}
        {sortedComments.map((comment) => {
          const linkedItem = comment.anchor.itemId
            ? state.items.find((it) => it.id === comment.anchor.itemId)
            : undefined;
          return (
            <article
              key={comment.id}
              style={{
                padding: 10,
                borderRadius: 7,
                border: `0.5px solid ${theme.border}`,
                background: theme.panelAlt,
                opacity: comment.resolved ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    onSeek(comment.anchor.frame);
                    if (comment.anchor.itemId) onSelectItem(comment.anchor.itemId);
                  }}
                  style={{
                    border: 'none',
                    background: themeAlpha.accent(0.15),
                    color: theme.accent,
                    borderRadius: 4,
                    padding: '2px 7px',
                    fontSize: 10.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatTimecode(comment.anchor.frame, state.fps)}
                  {linkedItem ? ` · ${linkedItem.name}` : ''}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void commit(setReviewResolved(comments, comment.id, !comment.resolved))}
                    style={smallActionBtnStyle}
                  >
                    {comment.resolved ? t('重新打开') : t('解决')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    title={t('删除评论')}
                    aria-label={t('删除评论')}
                    onClick={() => void commit(removeReviewComment(comments, comment.id))}
                    style={{ ...smallActionBtnStyle, color: theme.danger }}
                  >
                    <Icon name="trash" size={11} />
                  </button>
                </div>
              </div>
              <p style={{ margin: '8px 0 6px', fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', color: theme.text }}>
                {comment.text}
              </p>
              {comment.replies.map((reply) => (
                <div
                  key={reply.id}
                  style={{
                    marginTop: 5,
                    padding: '5px 8px',
                    borderLeft: `2px solid ${theme.accent}`,
                    background: theme.bg,
                    borderRadius: 4,
                    fontSize: 11,
                    color: theme.textDim,
                  }}
                >
                  {reply.text}
                </div>
              ))}
              {replyingTo === comment.id ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                  <input
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && replyText.trim()) void handleReply(comment.id);
                    }}
                    placeholder={t('输入回复')}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: `0.5px solid ${theme.border}`,
                      borderRadius: 4,
                      background: theme.bg,
                      color: theme.text,
                      padding: '4px 7px',
                      fontSize: 11,
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !replyText.trim()}
                    onClick={() => void handleReply(comment.id)}
                    style={smallActionBtnStyle}
                  >
                    {t('回复')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(comment.id);
                    setReplyText('');
                  }}
                  style={{ ...smallActionBtnStyle, marginTop: 4 }}
                >
                  {t('回复')}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {error && (
        <div role="alert" style={{ padding: '7px 12px', borderTop: `0.5px solid ${theme.border}`, color: theme.danger, fontSize: 11 }}>
          {error}
        </div>
      )}
    </div>
  );
}

interface SimpleTimelineProps {
  state: TimelineState;
  commands: EditorCommands;
  playheadFrame: number;
  playing: boolean;
  onSeek: (frame: number) => void;
  onTogglePlay: () => void;
  comments: ReviewComment[];
  onQuickComment: () => void;
  onOpenComment: (comment: ReviewComment) => void;
  onDeselectAll?: () => void;
}

interface ClipDragState {
  pointerId: number;
  item: TimelineItem;
  mode: 'move' | 'trim-start' | 'trim-end';
  startClientX: number;
  initialStart: number;
  initialDuration: number;
}

function TimelineLayerScrollbar({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const [scrollInfo, setScrollInfo] = useState({ top: 0, height: 1, clientHeight: 1 });
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const trackBarRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);

  const updateScrollInfo = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollInfo({
      top: el.scrollTop,
      height: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollInfo();
    el.addEventListener('scroll', updateScrollInfo, { passive: true });
    const ro = new ResizeObserver(updateScrollInfo);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollInfo);
      ro.disconnect();
    };
  }, [scrollRef, updateScrollInfo]);

  const { top, height, clientHeight } = scrollInfo;
  const canScroll = height > clientHeight + 4;
  const BUTTON_H = 24;

  const barHeight = Math.max(1, clientHeight - BUTTON_H * 2);
  const thumbHeight = Math.max(36, Math.min(barHeight, Math.round((clientHeight / Math.max(1, height)) * barHeight)));
  const maxThumbTop = Math.max(0, barHeight - thumbHeight);
  const maxScroll = Math.max(1, height - clientHeight);
  const thumbTop = Math.min(maxThumbTop, Math.round((top / maxScroll) * maxThumbTop));

  const handlePointerDownThumb = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
  };

  const handlePointerMoveThumb = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || !scrollRef.current) return;
    const deltaY = e.clientY - dragStartYRef.current;
    const scrollDelta = (deltaY / Math.max(1, maxThumbTop)) * maxScroll;
    scrollRef.current.scrollTop = Math.max(0, Math.min(maxScroll, dragStartScrollTopRef.current + scrollDelta));
  };

  const handlePointerUpThumb = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const scrollStep = (direction: 'up' | 'down') => {
    if (!scrollRef.current) return;
    const delta = direction === 'up' ? -50 : 50;
    scrollRef.current.scrollBy({ top: delta, behavior: 'smooth' });
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackBarRef.current || !scrollRef.current) return;
    const rect = trackBarRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    if (clickY < thumbTop) {
      scrollRef.current.scrollBy({ top: -clientHeight * 0.7, behavior: 'smooth' });
    } else if (clickY > thumbTop + thumbHeight) {
      scrollRef.current.scrollBy({ top: clientHeight * 0.7, behavior: 'smooth' });
    }
  };

  return (
    <div
      style={{
        width: 26,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: theme.panel,
        borderLeft: `0.5px solid ${theme.border}`,
        userSelect: 'none',
        zIndex: 15,
      }}
    >
      {/* Up Button (Scroll Layers Up) */}
      <button
        type="button"
        title="التمرير للطبقات العليا"
        onClick={() => scrollStep('up')}
        style={{
          width: '100%',
          height: BUTTON_H,
          padding: 0,
          border: 'none',
          borderBottom: `0.5px solid ${theme.border}`,
          background: 'transparent',
          color: theme.textDim,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* Middle Track */}
      <div
        ref={trackBarRef}
        onClick={handleTrackClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          flex: 1,
          width: '100%',
          position: 'relative',
          background: 'rgba(0, 0, 0, 0.22)',
          cursor: 'pointer',
        }}
      >
        {canScroll && (
          <div
            onPointerDown={handlePointerDownThumb}
            onPointerMove={handlePointerMoveThumb}
            onPointerUp={handlePointerUpThumb}
            onPointerCancel={handlePointerUpThumb}
            style={{
              position: 'absolute',
              top: thumbTop,
              left: 3,
              right: 3,
              height: thumbHeight,
              borderRadius: 6,
              background: isDragging
                ? theme.accent
                : isHovered
                ? themeAlpha.accent(0.65)
                : 'rgba(255, 255, 255, 0.26)',
              border: `1px solid ${isDragging || isHovered ? theme.accent : 'rgba(255, 255, 255, 0.12)'}`,
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: isDragging ? 'none' : 'background 0.15s, border-color 0.15s',
              touchAction: 'none',
            }}
          >
            {/* Grab Grip Indicator: 3 small horizontal lines */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2.5,
                pointerEvents: 'none',
              }}
            >
              <div style={{ width: 10, height: 1.5, background: 'rgba(255, 255, 255, 0.55)', borderRadius: 1 }} />
              <div style={{ width: 10, height: 1.5, background: 'rgba(255, 255, 255, 0.55)', borderRadius: 1 }} />
              <div style={{ width: 10, height: 1.5, background: 'rgba(255, 255, 255, 0.55)', borderRadius: 1 }} />
            </div>
          </div>
        )}
      </div>

      {/* Down Button (Scroll Layers Down) */}
      <button
        type="button"
        title="التمرير للطبقات السفلى"
        onClick={() => scrollStep('down')}
        style={{
          width: '100%',
          height: BUTTON_H,
          padding: 0,
          border: 'none',
          borderTop: `0.5px solid ${theme.border}`,
          background: 'transparent',
          color: theme.textDim,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}

function SimpleTimeline({
  state,
  commands,
  playheadFrame,
  playing,
  onSeek,
  onTogglePlay,
  comments,
  onQuickComment,
  onOpenComment,
  onDeselectAll,
}: SimpleTimelineProps) {
  const t = useT();
  const [pxPerFrame, setPxPerFrame] = useState(2.2);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ClipDragState | null>(null);
  const scrubbingRef = useRef<number | null>(null);

  const totalFrames = useMemo(() => {
    const maxClipEnd = state.items.reduce((max, item) => Math.max(max, item.startFrame + item.durationInFrames), 0);
    return Math.max(state.fps * 10, maxClipEnd + state.fps * 3);
  }, [state.fps, state.items]);

  const trackIds = useMemo(() => {
    const ids = [...timelineTrackIds(state)];
    const audioTrackList = ids.filter((id) => trackKind(state, id) === 'audio');
    if (audioTrackList.length < 2 && !ids.includes('A2')) {
      ids.push('A2');
    }
    return ids;
  }, [state]);
  const LABEL_W = 84;
  const timelineWidth = LABEL_W + Math.ceil(totalFrames * pxPerFrame) + 80;

  const frameFromClientX = useCallback(
    (clientX: number): number => {
      const container = trackAreaRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const xInScroll = clientX - rect.left + container.scrollLeft - LABEL_W;
      return Math.max(0, Math.round(xInScroll / pxPerFrame));
    },
    [pxPerFrame],
  );

  const handleRulerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    scrubbingRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    commands.selectItem(null);
    onDeselectAll?.();
    onSeek(frameFromClientX(e.clientX));
  };

  const handleRulerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current !== e.pointerId) return;
    onSeek(frameFromClientX(e.clientX));
  };

  const handleRulerPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current === e.pointerId) {
      scrubbingRef.current = null;
    }
  };

  const beginClipDrag = (
    e: ReactPointerEvent<HTMLElement>,
    item: TimelineItem,
    mode: ClipDragState['mode'],
  ) => {
    e.stopPropagation();
    commands.selectItem(item.id);
    commands.beginHistoryGesture();
    dragRef.current = {
      pointerId: e.pointerId,
      item,
      mode,
      startClientX: e.clientX,
      initialStart: item.startFrame,
      initialDuration: item.durationInFrames,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveClipDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    const deltaFrames = Math.round((e.clientX - active.startClientX) / pxPerFrame);
    if (active.mode === 'move') {
      commands.setItemTiming(active.item.id, {
        startFrame: Math.max(0, active.initialStart + deltaFrames),
      });
    } else if (active.mode === 'trim-start') {
      const maxDelta = active.initialDuration - 1;
      const clampedDelta = Math.max(-active.initialStart, Math.min(maxDelta, deltaFrames));
      commands.setItemTiming(active.item.id, {
        startFrame: active.initialStart + clampedDelta,
        durationInFrames: active.initialDuration - clampedDelta,
      });
    } else {
      commands.setItemTiming(active.item.id, {
        durationInFrames: Math.max(1, active.initialDuration + deltaFrames),
      });
    }
  };

  const endClipDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      commands.endHistoryGesture();
    }
  };

  const majorStepFrames = useMemo(() => {
    const secondsPerTick = pxPerFrame < 1 ? 5 : pxPerFrame < 2.5 ? 2 : 1;
    return secondsPerTick * state.fps;
  }, [pxPerFrame, state.fps]);

  const ticks = useMemo(() => {
    const result: number[] = [];
    for (let f = 0; f <= totalFrames; f += majorStepFrames) {
      result.push(f);
    }
    return result;
  }, [majorStepFrames, totalFrames]);

  return (
    <section
      aria-label={t('时间线')}
      style={{
        gridColumn: 1,
        gridRow: 4,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: theme.bg,
        borderTop: `0.5px solid ${theme.border}`,
        userSelect: 'none',
        paddingBottom: 32,
      }}
    >
      {/* Simple Transport & Comment Toolbar */}
      <div
        style={{
          height: 38,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: theme.panel,
          borderBottom: `0.5px solid ${theme.border}`,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: 'none',
            background: theme.accent,
            color: theme.onAccent,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name={playing ? 'pause' : 'play'} size={13} />
        </button>

        <span
          style={{
            fontSize: 12,
            fontFamily: 'Geist Mono, monospace',
            fontVariantNumeric: 'tabular-nums',
            color: theme.text,
          }}
        >
          {formatTimecode(playheadFrame, state.fps)}
          <span style={{ color: theme.textDim }}> / {formatTimecode(totalFrames, state.fps)}</span>
        </span>

        <button
          type="button"
          onClick={onQuickComment}
          style={{
            height: 26,
            padding: '0 10px',
            borderRadius: 6,
            border: `0.5px solid ${theme.border}`,
            background: theme.panelAlt,
            color: theme.text,
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name="clipboard" size={12} />
          <span>+ {t('当前时间点评论')}</span>
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="search" size={12} />
          <input
            type="range"
            min={0.5}
            max={6}
            step={0.1}
            value={pxPerFrame}
            onChange={(e) => setPxPerFrame(Number(e.target.value))}
            aria-label="Zoom"
            style={{ width: 96 }}
          />
        </div>
      </div>

      {/* Scrollable Tracks + Wide Vertical Layer Scrollbar */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          position: 'relative',
          overflow: 'hidden',
          background: theme.bg,
        }}
      >
        <div
          ref={trackAreaRef}
          className="cc-timeline-wide-scroll"
          onPointerDown={(e) => {
            if (e.target === trackAreaRef.current || (e.target as HTMLElement).classList.contains('cc-timeline-wide-scroll')) {
              commands.selectItem(null);
              onDeselectAll?.();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowX: 'auto',
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            position: 'relative',
            paddingBottom: 40,
          }}
        >
        <div style={{ width: timelineWidth, minHeight: '100%', position: 'relative' }}>
          {/* Time Ruler */}
          <div
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={handleRulerPointerUp}
            style={{
              height: 28,
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: theme.panel,
              borderBottom: `0.5px solid ${theme.border}`,
              cursor: 'ew-resize',
            }}
          >
            {ticks.map((tickFrame) => (
              <div
                key={tickFrame}
                style={{
                  position: 'absolute',
                  left: LABEL_W + tickFrame * pxPerFrame,
                  top: 0,
                  bottom: 0,
                  borderLeft: `0.5px solid ${theme.border}`,
                  paddingLeft: 4,
                  fontSize: 9.5,
                  color: theme.textDim,
                  lineHeight: '28px',
                  fontVariantNumeric: 'tabular-nums',
                  pointerEvents: 'none',
                }}
              >
                {formatTimecode(tickFrame, state.fps)}
              </div>
            ))}

            {/* Comment Pins on Ruler */}
            {comments.map((comment) => (
              <button
                key={comment.id}
                type="button"
                title={comment.text}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComment(comment);
                }}
                style={{
                  position: 'absolute',
                  left: LABEL_W + comment.anchor.frame * pxPerFrame - 8,
                  top: 5,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: 'none',
                  background: comment.resolved ? theme.textDim : '#F59E0B',
                  color: '#000',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  zIndex: 12,
                }}
              >
                C
              </button>
            ))}
          </div>

          {/* Track Lanes */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {trackIds.map((trackId) => {
              const isFallbackA2 = trackId === 'A2' && !state.tracks?.['A2'];
              const itemsOnTrack = state.items.filter((it) => it.track === trackId || (isFallbackA2 && it.track === 'A2'));
              const kind = isFallbackA2 ? 'audio' : trackKind(state, trackId);
              const alias = isFallbackA2 ? 'A2' : trackAlias(state, trackId);
              return (
                <div
                  key={trackId}
                  style={{
                    display: 'flex',
                    height: 44,
                    borderBottom: `0.5px solid ${theme.border}`,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: LABEL_W,
                      flexShrink: 0,
                      position: 'sticky',
                      left: 0,
                      zIndex: 8,
                      background: theme.panel,
                      borderRight: `0.5px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: theme.textDim,
                    }}
                  >
                    {alias}
                  </div>

                  <div
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        commands.selectItem(null);
                        onDeselectAll?.();
                        onSeek(frameFromClientX(e.clientX));
                      }
                    }}
                    style={{ flex: 1, position: 'relative' }}
                  >
                    {itemsOnTrack.map((item) => {
                      const selected = state.selectedId === item.id;
                      const isEditableComp =
                        item.kind === 'motion-graphic' || item.kind === 'text' || item.kind === 'solid';
                      const left = item.startFrame * pxPerFrame;
                      const width = Math.max(18, item.durationInFrames * pxPerFrame);
                      const bg = isEditableComp
                        ? themeAlpha.accent(selected ? 0.38 : 0.22)
                        : kind === 'audio'
                          ? 'rgba(16, 185, 129, 0.22)'
                          : theme.panelAlt;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => beginClipDrag(e, item, 'move')}
                          onPointerMove={moveClipDrag}
                          onPointerUp={endClipDrag}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              commands.selectItem(item.id);
                            }
                          }}
                          style={{
                            position: 'absolute',
                            left,
                            top: 5,
                            height: 34,
                            width,
                            borderRadius: 6,
                            background: bg,
                            border: `${selected ? 1.5 : 0.5}px solid ${
                              selected ? theme.accent : isEditableComp ? theme.accent : theme.borderLight
                            }`,
                            color: theme.text,
                            fontSize: 11,
                            fontWeight: isEditableComp ? 600 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 10px',
                            boxSizing: 'border-box',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            cursor: 'grab',
                          }}
                        >
                          {/* Left Trim Handle */}
                          <div
                            onPointerDown={(e) => beginClipDrag(e, item, 'trim-start')}
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 6,
                              cursor: 'ew-resize',
                              background: selected ? theme.accent : 'transparent',
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                          {/* Right Trim Handle */}
                          <div
                            onPointerDown={(e) => beginClipDrag(e, item, 'trim-end')}
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: 6,
                              cursor: 'ew-resize',
                              background: selected ? theme.accent : 'transparent',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Playhead Line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: LABEL_W + playheadFrame * pxPerFrame,
              width: 1.5,
              background: theme.accent,
              pointerEvents: 'none',
              zIndex: 15,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: -5,
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: theme.accent,
              }}
            />
          </div>
        </div>
      </div>

      {/* Dedicated Wide Layer Scrollbar on Right */}
      <TimelineLayerScrollbar scrollRef={trackAreaRef} />
    </div>
  </section>
  );
}

const sliderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  color: theme.textDim,
};

const sliderLabelStyle: CSSProperties = {
  width: 68,
  flexShrink: 0,
};

const numberInputStyle: CSSProperties = {
  width: 58,
  padding: '3px 6px',
  borderRadius: 4,
  border: `0.5px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
};

const nudgeBtnStyle: CSSProperties = {
  border: `0.5px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 10,
  cursor: 'pointer',
};

const smallActionBtnStyle: CSSProperties = {
  border: `0.5px solid ${theme.border}`,
  borderRadius: 4,
  padding: '2px 7px',
  background: 'transparent',
  color: theme.textDim,
  fontSize: 10.5,
  cursor: 'pointer',
};

export function SimpleEditorWorkspaceView(props: EditorWorkspaceViewProps) {
  useWorkspaceDialogPrefetch();
  // Headless project ownership registration so saving to the shared SQLite/IDB store works without ChatPanel.
  useExternalAgentBridge(props.chatPanel.ctx, props.chatPanel.projectId);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('properties');
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const { frame: playheadFrame, playing, seekTo, togglePlay } = usePlayerPlayhead(props.previewPanel.playerRef);
  const { comments, busy, error, commit } = useSimpleComments(props.topBar.projectId);

  const state = props.timeline.state;
  const commands = props.timeline.commands;
  const selectedItem = props.previewPanel.selectedItem;
  const selectedCaption = props.inspectorPanel?.selectedCaption ?? null;
  const openCommentCount = comments.filter((c) => !c.resolved).length;

  // Auto-select the first editable component ON INITIAL LOAD ONLY if nothing is selected yet.
  const didInitialAutoSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialAutoSelectRef.current) return;
    if (state.selectedId) {
      didInitialAutoSelectRef.current = true;
      return;
    }
    const firstEditable = state.items.find(
      (it) => it.kind === 'motion-graphic' || it.kind === 'text' || it.kind === 'solid',
    );
    if (firstEditable) {
      didInitialAutoSelectRef.current = true;
      commands.selectItem(firstEditable.id);
    }
  }, [commands, state.items, state.selectedId]);

  // Ensure track A2 is always created in the document for background music
  useEffect(() => {
    const audioTrackList = timelineTrackIds(state).filter((id) => trackKind(state, id) === 'audio');
    if (audioTrackList.length < 2) {
      commands.createTrack('audio', { name: 'A2' });
    }
  }, [state, commands]);

  // Blur overlay state and handlers
  const [selectedBlurId, setSelectedBlurId] = useState<string | null>(null);

  const mainVideoItems = useMemo(
    () => state.items.filter((it) => it.kind === 'video' && !it.name.toLowerCase().includes('outro')),
    [state.items]
  );
  const primaryVideoItem = mainVideoItems[0] ?? state.items.find((it) => it.kind === 'video');

  const blurRegions = useMemo<BlurRegion[]>(() => {
    if (!primaryVideoItem) return [];
    return ((primaryVideoItem.blurRegions ?? primaryVideoItem.props?.blurRegions) as BlurRegion[]) || [];
  }, [primaryVideoItem]);

  const handleAddBlurRegion = useCallback(() => {
    if (!primaryVideoItem) return;
    const newRegion: BlurRegion = {
      id: `blur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: 30 + (blurRegions.length * 5) % 25,
      y: 35 + (blurRegions.length * 5) % 25,
      width: 40,
      height: 20,
    };
    const next = [...blurRegions, newRegion];
    mainVideoItems.forEach((v) => {
      commands.updateItemProps(v.id, { blurRegions: next });
    });
    setSelectedBlurId(newRegion.id);
  }, [blurRegions, commands, mainVideoItems, primaryVideoItem]);

  const handleUpdateBlurRegion = useCallback((updated: BlurRegion) => {
    const next = blurRegions.map((r) => (r.id === updated.id ? updated : r));
    mainVideoItems.forEach((v) => {
      commands.updateItemProps(v.id, { blurRegions: next });
    });
  }, [blurRegions, commands, mainVideoItems]);

  const handleRemoveBlurRegion = useCallback((id: string) => {
    const next = blurRegions.filter((r) => r.id !== id);
    mainVideoItems.forEach((v) => {
      commands.updateItemProps(v.id, { blurRegions: next });
    });
    if (selectedBlurId === id) setSelectedBlurId(null);
  }, [blurRegions, commands, mainVideoItems, selectedBlurId]);

  const handleQuickComment = useCallback(() => {
    setSidebarTab('comments');
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const handleOpenComment = useCallback(
    (comment: ReviewComment) => {
      seekTo(comment.anchor.frame);
      if (comment.anchor.itemId) {
        commands.selectItem(comment.anchor.itemId);
      }
      setSidebarTab('comments');
    },
    [commands, seekTo],
  );

  return (
    <div
      className="cc-editor-shell cc-simple-editor-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 420px',
        gridTemplateRows: `44px minmax(0, 1fr) 0 270px`,
        height: '100vh',
        overflow: 'hidden',
        background: theme.bg,
        color: theme.text,
        fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
      }}
    >
      <SimpleTopBar {...props.topBar} />

      <Suspense fallback={null}>
        {props.exportDialog && <ExportDialog {...props.exportDialog} />}
      </Suspense>

      {/* Center-Left: Interactive Video Canvas (drag/move/resize components directly on screen) */}
      <div
        className="cc-preview-workspace"
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('.cc-preview-canvas')) {
            commands.selectItem(null);
            setSelectedBlurId(null);
          }
        }}
        style={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <PreviewPanel
          {...props.previewPanel}
          inspectorOpen={false}
          hideComments={true}
          customOverlay={
            <BlurCanvasOverlay
              regions={blurRegions}
              selectedId={selectedBlurId}
              onSelectRegion={setSelectedBlurId}
              onChangeRegion={handleUpdateBlurRegion}
              onRemoveRegion={handleRemoveBlurRegion}
              onDeselectItem={() => commands.selectItem(null)}
            />
          }
        />
      </div>

      {/* Right Column: Component Custom Properties (Full height to bottom) */}
      <aside
        style={{
          gridColumn: 2,
          gridRow: '2 / -1',
          borderLeft: `0.5px solid ${theme.border}`,
          background: theme.panel,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div
          dir="rtl"
          style={{
            height: 38,
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `0.5px solid ${theme.border}`,
            background: theme.panelAlt,
            fontSize: 12.5,
            fontWeight: 700,
            color: theme.text,
            flexShrink: 0,
            fontFamily: 'Cairo, Noto Sans Arabic, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => setSidebarTab('properties')}
              style={{
                border: 'none',
                background: 'transparent',
                color: sidebarTab === 'properties' ? theme.text : theme.textDim,
                fontSize: 12.5,
                fontWeight: sidebarTab === 'properties' ? 700 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: 0,
              }}
            >
              <Icon name="sliders" size={13} />
              <span>لوحة تحكم المحرر الشاملة</span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('comments')}
              style={{
                border: 'none',
                background: 'transparent',
                color: sidebarTab === 'comments' ? theme.text : theme.textDim,
                fontSize: 12,
                fontWeight: sidebarTab === 'comments' ? 700 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: 0,
              }}
            >
              <span>التعليقات</span>
              {openCommentCount > 0 && (
                <span
                  style={{
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 8,
                    background: theme.accent,
                    color: theme.onAccent,
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {openCommentCount}
                </span>
              )}
            </button>
          </div>
          <span style={{ fontSize: 10, color: theme.accent, background: themeAlpha.accent(0.12), padding: '2px 6px', borderRadius: 4 }}>
            تحرير مباشر
          </span>
        </div>

        {sidebarTab === 'properties' ? (
          <SimplePropertiesPane
            state={state}
            templates={props.libraryPanel.templates}
            commands={commands}
            selectedItem={selectedItem}
            selectedCaption={selectedCaption}
            onSeek={seekTo}
            blurRegions={blurRegions}
            selectedBlurId={selectedBlurId}
            onSelectBlur={setSelectedBlurId}
            onAddBlur={handleAddBlurRegion}
            onRemoveBlur={handleRemoveBlurRegion}
          />
        ) : (
          <SimpleCommentsPane
            timelineId={props.timelineTabs.doc.activeTimelineId}
            state={state}
            selectedItem={selectedItem}
            playheadFrame={playheadFrame}
            comments={comments}
            busy={busy}
            error={error}
            commit={commit}
            onSeek={seekTo}
            onSelectItem={(id) => commands.selectItem(id)}
            composerRef={composerRef}
          />
        )}
      </aside>

      <div style={{ gridColumn: 1, gridRow: 3 }}>
        <Divider orientation="horizontal" onResize={props.onResizeTimeline} />
      </div>

      {/* Bottom: Simple Timeline */}
      <SimpleTimeline
        state={state}
        commands={commands}
        playheadFrame={playheadFrame}
        playing={playing}
        onSeek={seekTo}
        onTogglePlay={togglePlay}
        comments={comments}
        onQuickComment={handleQuickComment}
        onOpenComment={handleOpenComment}
        onDeselectAll={() => {
          commands.selectItem(null);
          setSelectedBlurId(null);
        }}
      />

      <AppToastHost />
    </div>
  );
}
