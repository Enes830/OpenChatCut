import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { theme } from '../theme';
import type { BlurBox } from './types';

interface ThumbnailBlurCanvasProps {
  imageUrl: string | null;
  aspectRatio: number;
  blurBoxes: BlurBox[];
  selectedBoxId: string | null;
  editable: boolean;
  busy?: boolean;
  emptyLabel: string;
  onSelectBox: (id: string | null) => void;
  onChangeBoxes: (next: BlurBox[]) => void;
}

type DragAction =
  | { kind: 'draw'; id: string; startX: number; startY: number }
  | { kind: 'move'; id: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number }
  | { kind: 'resize'; id: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function resolveBoxRadius(box: BlurBox): string {
  const isCircle = box.shape === 'circle' || (box.borderRadius !== undefined && box.borderRadius >= 100);
  if (isCircle) return '50%';
  const isRounded = box.shape === 'rounded' || (!isCircle && (box.borderRadius ?? 0) > 0);
  if (isRounded) return `${Math.min(48, Math.max(6, Math.round((box.borderRadius ?? 24) * 0.5)))}px`;
  return '2px';
}

export function ThumbnailBlurCanvas({
  imageUrl,
  aspectRatio,
  blurBoxes,
  selectedBoxId,
  editable,
  busy = false,
  emptyLabel,
  onSelectBox,
  onChangeBoxes,
}: ThumbnailBlurCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragAction | null>(null);
  const boxesRef = useRef(blurBoxes);
  boxesRef.current = blurBoxes;

  const getPctPoint = useCallback((clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100);
    const y = clamp(((clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100);
    return { x, y };
  }, []);

  const handleStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !imageUrl) return;
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getPctPoint(e.clientX, e.clientY);
    const newId = `blur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newBox: BlurBox = {
      id: newId,
      x: Number(pt.x.toFixed(2)),
      y: Number(pt.y.toFixed(2)),
      width: 0.5,
      height: 0.5,
      sigma: 24,
      strength: 70,
      shape: 'square',
      borderRadius: 0,
    };
    onChangeBoxes([...boxesRef.current, newBox]);
    onSelectBox(newId);
    setDrag({ kind: 'draw', id: newId, startX: pt.x, startY: pt.y });
  };

  const handleBoxPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    box: BlurBox,
    kind: 'move' | 'resize',
  ) => {
    if (!editable) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    stageRef.current?.setPointerCapture(e.pointerId);
    const pt = getPctPoint(e.clientX, e.clientY);
    onSelectBox(box.id);
    setDrag({
      kind,
      id: box.id,
      startX: pt.x,
      startY: pt.y,
      origX: box.x,
      origY: box.y,
      origW: box.width,
      origH: box.height,
    });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !editable) return;
    const pt = getPctPoint(e.clientX, e.clientY);

    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, pt.x);
      const y = Math.min(drag.startY, pt.y);
      const width = Math.abs(pt.x - drag.startX);
      const height = Math.abs(pt.y - drag.startY);
      onChangeBoxes(
        boxesRef.current.map((b) =>
          b.id === drag.id
            ? {
                ...b,
                x: Number(x.toFixed(2)),
                y: Number(y.toFixed(2)),
                width: Number(Math.max(1, width).toFixed(2)),
                height: Number(Math.max(1, height).toFixed(2)),
              }
            : b,
        ),
      );
      return;
    }

    if (drag.kind === 'move') {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const nx = clamp(drag.origX + dx, 0, Math.max(0, 100 - drag.origW));
      const ny = clamp(drag.origY + dy, 0, Math.max(0, 100 - drag.origH));
      onChangeBoxes(
        boxesRef.current.map((b) =>
          b.id === drag.id
            ? { ...b, x: Number(nx.toFixed(2)), y: Number(ny.toFixed(2)) }
            : b,
        ),
      );
      return;
    }

    if (drag.kind === 'resize') {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const nw = clamp(drag.origW + dx, 2, 100 - drag.origX);
      const nh = clamp(drag.origH + dy, 2, 100 - drag.origY);
      onChangeBoxes(
        boxesRef.current.map((b) =>
          b.id === drag.id
            ? { ...b, width: Number(nw.toFixed(2)), height: Number(nh.toFixed(2)) }
            : b,
        ),
      );
    }
  };

  const handlePointerUp = () => {
    if (!drag) return;
    if (drag.kind === 'draw') {
      const drawn = boxesRef.current.find((b) => b.id === drag.id);
      if (drawn && drawn.width < 1.5 && drawn.height < 1.5) {
        onChangeBoxes(boxesRef.current.filter((b) => b.id !== drag.id));
        onSelectBox(null);
      }
    }
    setDrag(null);
  };

  useEffect(() => {
    if (!editable || !selectedBoxId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChangeBoxes(boxesRef.current.filter((b) => b.id !== selectedBoxId));
        onSelectBox(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editable, selectedBoxId, onChangeBoxes, onSelectBox]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '20px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative',
          height: 'min(80vh, 760px)',
          maxWidth: '100%',
          aspectRatio: `${aspectRatio}`,
          background: theme.panel,
          borderRadius: 10,
          overflow: 'hidden',
          border: `1px solid ${theme.border}`,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
          cursor: editable && imageUrl ? 'crosshair' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Thumbnail preview"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: theme.textDim,
              fontSize: 13,
              padding: 24,
              textAlign: 'center',
            }}
          >
            {emptyLabel}
          </div>
        )}

        {editable &&
          imageUrl &&
          blurBoxes.map((box, index) => {
            const isSelected = box.id === selectedBoxId;
            const strength = box.strength ?? Math.round((box.sigma || 18) / 0.35);
            const blurPx = Math.max(4, Math.min(32, Math.round(strength * 0.25)));
            const radius = resolveBoxRadius(box);
            return (
              <div
                key={box.id}
                onPointerDown={(e) => handleBoxPointerDown(e, box, 'move')}
                style={{
                  position: 'absolute',
                  left: `${box.x}%`,
                  top: `${box.y}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                  boxSizing: 'border-box',
                  backdropFilter: `blur(${blurPx}px)`,
                  WebkitBackdropFilter: `blur(${blurPx}px)`,
                  background: isSelected ? 'rgba(59, 130, 246, 0.16)' : 'rgba(255, 255, 255, 0.08)',
                  border: isSelected ? '2px solid #3b82f6' : '1.5px dashed rgba(255, 255, 255, 0.82)',
                  borderRadius: radius,
                  cursor: 'move',
                  boxShadow: isSelected ? '0 0 0 1px rgba(59, 130, 246, 0.45)' : 'none',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -22,
                    left: 0,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: isSelected ? '#2563eb' : 'rgba(15, 23, 42, 0.85)',
                    color: '#ffffff',
                    fontSize: 10,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  {index + 1}
                </div>

                <div
                  onPointerDown={(e) => handleBoxPointerDown(e, box, 'resize')}
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    background: isSelected ? '#3b82f6' : '#ffffff',
                    border: '2px solid #0f172a',
                    cursor: 'nwse-resize',
                  }}
                />
              </div>
            );
          })}

        {busy && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10, 12, 16, 0.55)',
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                background: theme.panel,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              جاري تحديث الغلاف...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
