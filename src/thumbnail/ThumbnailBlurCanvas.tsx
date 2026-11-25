import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BlurBox } from './types';

interface ThumbnailBlurCanvasProps {
  imageUrl: string | null;
  aspectRatio: number; // width / height, e.g. 9 / 16
  blurBoxes: BlurBox[];
  selectedBoxId: string | null;
  editable: boolean;
  defaultSigma: number;
  emptyLabel: string;
  hintLabel: string;
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

export function ThumbnailBlurCanvas({
  imageUrl,
  aspectRatio,
  blurBoxes,
  selectedBoxId,
  editable,
  defaultSigma,
  emptyLabel,
  hintLabel,
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
      sigma: defaultSigma,
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
    // Remove accidental tiny clicks (< 1.5% x 1.5%)
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
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', height: '100%', justifyContent: 'center' }}>
      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'relative',
          height: 'min(74vh, 720px)',
          aspectRatio: String(aspectRatio || 9 / 16),
          maxWidth: '100%',
          background: '#0d0f13',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          cursor: editable && imageUrl ? 'crosshair' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
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
              color: '#8b92a1',
              fontSize: 13,
              padding: 24,
              textAlign: 'center',
            }}
          >
            {emptyLabel}
          </div>
        )}

        {editable && imageUrl && blurBoxes.map((box, index) => {
          const isSelected = box.id === selectedBoxId;
          const pxBlur = Math.max(4, Math.min(28, Math.round((box.sigma || 12) * 0.85)));
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
                backdropFilter: `blur(${pxBlur}px)`,
                WebkitBackdropFilter: `blur(${pxBlur}px)`,
                background: isSelected ? 'rgba(40, 129, 226, 0.16)' : 'rgba(255, 255, 255, 0.08)',
                border: isSelected ? '2px solid #2881E2' : '1.5px dashed rgba(255,255,255,0.75)',
                borderRadius: 4,
                cursor: 'move',
                boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#ffffff',
                  background: isSelected ? '#2881E2' : 'rgba(15, 18, 24, 0.78)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  pointerEvents: 'none',
                  lineHeight: 1.4,
                }}
              >
                {index + 1}
              </span>

              {isSelected && (
                <>
                  <button
                    type="button"
                    aria-label="Remove blur box"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeBoxes(blurBoxes.filter((b) => b.id !== box.id));
                      onSelectBox(null);
                    }}
                    style={{
                      position: 'absolute',
                      top: -10,
                      right: -10,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.25)',
                      background: '#dc2626',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                  <div
                    onPointerDown={(e) => handleBoxPointerDown(e, box, 'resize')}
                    style={{
                      position: 'absolute',
                      right: -5,
                      bottom: -5,
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: '#ffffff',
                      border: '2px solid #2881E2',
                      cursor: 'nwse-resize',
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {editable && imageUrl && (
        <div style={{ fontSize: 12, color: '#9aa3b2', textAlign: 'center' }}>
          {hintLabel}
        </div>
      )}
    </div>
  );
}
