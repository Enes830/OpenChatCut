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
import { Icon } from '../components/icons';
import { CaptionInspectorControls } from '../components/inspector/CaptionInspectorControls';
import { TextControl } from '../components/inspector/InspectorMediaControls';
import { groupInspectorPropSchema } from '../components/inspector/inspectorPropSchemaLayout';
import { PropSchemaField } from '../components/inspector/PropSchemaField';
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
import type { PropSpec, Tpl } from '../types';
import { AppToastHost } from '../ui/AppToastHost';
import type { EditorWorkspaceViewProps } from './EditorWorkspaceView';
import type { EditorCommands } from './storeCommands';
import { timelineTrackIds, trackAlias, trackKind, type TimelineItem, type TimelineState } from './types';
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

function inferPropSpecFromValue(key: string, value: unknown): PropSpec {
  if (typeof value === 'boolean') {
    return { key, label: key, type: 'boolean', defaultValue: value };
  }
  if (typeof value === 'number') {
    return { key, label: key, type: 'number', defaultValue: value };
  }
  if (typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim())) {
    return { key, label: key, type: 'color', defaultValue: value };
  }
  return { key, label: key, type: 'text', defaultValue: String(value ?? '') };
}

function resolveEffectiveSchema(item: TimelineItem, templates: readonly Tpl[]): PropSpec[] {
  const tplSchema = item.templateId
    ? (templates.find((tpl) => tpl.id === item.templateId)?.propSchema ?? [])
    : [];
  const itemProps = item.props ?? {};
  const existingKeys = new Set(tplSchema.map((spec) => spec.key));
  const extraSpecs: PropSpec[] = [];
  for (const [key, val] of Object.entries(itemProps)) {
    if (existingKeys.has(key)) continue;
    if (val === undefined || val === null || typeof val === 'object') continue;
    extraSpecs.push(inferPropSpecFromValue(key, val));
  }
  return [...tplSchema, ...extraSpecs];
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
          title={t('切换到完整编辑器')}
          aria-label={t('切换到完整编辑器')}
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
          <span>{t('完整编辑器')}</span>
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

interface SimplePropertiesPaneProps {
  state: TimelineState;
  templates: readonly Tpl[];
  commands: EditorCommands;
  selectedItem: TimelineItem | null;
  selectedCaption: NonNullable<EditorWorkspaceViewProps['inspectorPanel']>['selectedCaption'];
  onSeek: (frame: number) => void;
}

function SimplePropertiesPane({
  state,
  templates,
  commands,
  selectedItem,
  selectedCaption,
  onSeek,
}: SimplePropertiesPaneProps) {
  const t = useT();
  const editableComponents = useMemo(
    () =>
      state.items
        .filter((it) => it.kind === 'motion-graphic' || it.kind === 'text' || it.kind === 'solid')
        .sort((a, b) => a.startFrame - b.startFrame),
    [state.items],
  );

  const schema = useMemo(
    () => (selectedItem ? resolveEffectiveSchema(selectedItem, templates) : []),
    [selectedItem, templates],
  );

  const updateProp = useCallback(
    (key: string, value: unknown) => {
      if (!selectedItem) return;
      commands.updateItemProps(selectedItem.id, { [key]: value });
    },
    [commands, selectedItem],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 14, overflowY: 'auto', flex: 1 }}>
      {editableComponents.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: theme.textDim, marginBottom: 7 }}>
            {t('时间线上的可编辑组件')} ({editableComponents.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {editableComponents.map((comp) => {
              const isSelected = selectedItem?.id === comp.id;
              return (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => {
                    commands.selectItem(comp.id);
                    onSeek(comp.startFrame);
                  }}
                  style={{
                    padding: '4px 9px',
                    borderRadius: 6,
                    border: `0.5px solid ${isSelected ? theme.accent : theme.border}`,
                    background: isSelected ? themeAlpha.accent(0.18) : theme.panelAlt,
                    color: isSelected ? theme.accent : theme.text,
                    fontSize: 11,
                    fontWeight: isSelected ? 600 : 400,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    maxWidth: '100%',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {comp.name}
                  </span>
                  <span style={{ fontSize: 9.5, color: theme.textDim, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTimecode(comp.startFrame, state.fps)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedCaption ? (
        <CaptionInspectorControls
          selection={selectedCaption}
          onUpdate={(patch) => commands.updateCaptions(patch, selectedCaption.trackId)}
        />
      ) : selectedItem ? (
        <>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: theme.panelAlt,
              border: `0.5px solid ${theme.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 12.5, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedItem.name}
              </strong>
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: theme.bg,
                  color: theme.textDim,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatTimecode(selectedItem.startFrame, state.fps)}
              </span>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: theme.textDim }}>
              {t('自定义属性')}
            </div>

            {selectedItem.kind === 'text' && (
              <TextControl item={selectedItem} onPropChange={updateProp} />
            )}

            {selectedItem.kind === 'solid' && (
              <label className="cc-insp-mg-field">
                <span>{t('填充颜色')}</span>
                <input
                  type="color"
                  value={String(selectedItem.props?.color ?? '#1a1a1a')}
                  onChange={(e) => updateProp('color', e.target.value)}
                />
              </label>
            )}

            {selectedItem.kind === 'motion-graphic' && (
              schema.length === 0 ? (
                <div style={{ fontSize: 11.5, color: theme.textDim }}>{t('该模板无可编辑属性。')}</div>
              ) : (
                <div className="cc-insp-mg-grid">
                  {groupInspectorPropSchema(schema).map((group, groupIndex) =>
                    group.kind === 'color-row' ? (
                      <div className="cc-insp-color-row" key={`color-row:${groupIndex}`}>
                        {group.fields.map((field) => (
                          <PropSchemaField
                            key={field.key}
                            spec={field}
                            value={selectedItem.props?.[field.key] ?? field.defaultValue}
                            onChange={(val) => updateProp(field.key, val)}
                          />
                        ))}
                      </div>
                    ) : (
                      group.fields.map((field) => (
                        <PropSchemaField
                          key={field.key}
                          spec={field}
                          value={selectedItem.props?.[field.key] ?? field.defaultValue}
                          onChange={(val) => updateProp(field.key, val)}
                        />
                      ))
                    ),
                  )}
                </div>
              )
            )}
          </div>

          {selectedItem.kind !== 'audio' && (
            <ScreenPositionControls
              item={selectedItem}
              canvasWidth={state.width}
              canvasHeight={state.height}
              commands={commands}
            />
          )}
        </>
      ) : (
        <div
          style={{
            padding: 24,
            borderRadius: 8,
            border: `1px dashed ${theme.border}`,
            textAlign: 'center',
            color: theme.textDim,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {t('点击时间线上的组件以修改其文字、颜色或屏幕位置。')}
        </div>
      )}
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
}

interface ClipDragState {
  pointerId: number;
  item: TimelineItem;
  mode: 'move' | 'trim-start' | 'trim-end';
  startClientX: number;
  initialStart: number;
  initialDuration: number;
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

  const trackIds = useMemo(() => timelineTrackIds(state), [state]);
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
        gridColumn: '1 / -1',
        gridRow: 4,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: theme.bg,
        borderTop: `0.5px solid ${theme.border}`,
        userSelect: 'none',
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

      {/* Scrollable Ruler + Tracks */}
      <div
        ref={trackAreaRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
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
              const itemsOnTrack = state.items.filter((it) => it.track === trackId);
              const kind = trackKind(state, trackId);
              const alias = trackAlias(state, trackId);
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
  const t = useT();
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

  // Auto-select the first editable component when opening a project if nothing is selected yet.
  useEffect(() => {
    if (state.selectedId) return;
    const firstEditable = state.items.find(
      (it) => it.kind === 'motion-graphic' || it.kind === 'text' || it.kind === 'solid',
    );
    if (firstEditable) {
      commands.selectItem(firstEditable.id);
    }
  }, [commands, state.items, state.selectedId]);

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
        gridTemplateColumns: 'minmax(0, 1fr) 380px',
        gridTemplateRows: `44px minmax(0, 1fr) 0 230px`,
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
        style={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <PreviewPanel {...props.previewPanel} inspectorOpen={false} />
      </div>

      {/* Right Column: Component Custom Properties & Simple Comments */}
      <aside
        style={{
          gridColumn: 2,
          gridRow: 2,
          borderLeft: `0.5px solid ${theme.border}`,
          background: theme.panel,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div
          role="tablist"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            height: 38,
            borderBottom: `0.5px solid ${theme.border}`,
            background: theme.panelAlt,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'properties'}
            onClick={() => setSidebarTab('properties')}
            style={{
              border: 'none',
              borderBottom: `2px solid ${sidebarTab === 'properties' ? theme.accent : 'transparent'}`,
              background: 'transparent',
              color: sidebarTab === 'properties' ? theme.text : theme.textDim,
              fontSize: 12,
              fontWeight: sidebarTab === 'properties' ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            {t('组件属性')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'comments'}
            onClick={() => setSidebarTab('comments')}
            style={{
              border: 'none',
              borderBottom: `2px solid ${sidebarTab === 'comments' ? theme.accent : 'transparent'}`,
              background: 'transparent',
              color: sidebarTab === 'comments' ? theme.text : theme.textDim,
              fontSize: 12,
              fontWeight: sidebarTab === 'comments' ? 600 : 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span>{t('评论')}</span>
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

        {sidebarTab === 'properties' ? (
          <SimplePropertiesPane
            state={state}
            templates={props.libraryPanel.templates}
            commands={commands}
            selectedItem={selectedItem}
            selectedCaption={selectedCaption}
            onSeek={seekTo}
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

      <div style={{ gridColumn: '1 / -1', gridRow: 3 }}>
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
      />

      <AppToastHost />
    </div>
  );
}
