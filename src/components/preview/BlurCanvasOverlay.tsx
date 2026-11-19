import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BlurRegion } from '../../editor/types';
import { Icon } from '../icons';

export interface BlurCanvasOverlayProps {
  regions: BlurRegion[];
  selectedId: string | null;
  onSelectRegion: (id: string | null) => void;
  onChangeRegion: (region: BlurRegion) => void;
  onRemoveRegion: (id: string) => void;
  onDeselectItem?: () => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface DragSession {
  mode: DragMode;
  regionId: string;
  startX: number;
  startY: number;
  startRegion: BlurRegion;
  currentRegion: BlurRegion;
}

export function BlurCanvasOverlay({
  regions,
  selectedId,
  onSelectRegion,
  onChangeRegion,
  onRemoveRegion,
  onDeselectItem,
}: BlurCanvasOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Deselect blur box when user clicks anywhere outside the active box
  useEffect(() => {
    if (!selectedId) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Keep selection if clicking inside the overlay element itself (box, handles, badge)
      if (containerRef.current?.contains(target)) return;
      // Keep selection if clicking inside the blur controls in the properties sidebar
      if (target.closest('.cc-blur-card-action')) return;

      onSelectRegion(null);
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [selectedId, onSelectRegion]);

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: DragMode, region: BlurRegion) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const startRegion = { ...region };

      onSelectRegion(region.id);

      const session: DragSession = {
        mode,
        regionId: region.id,
        startX,
        startY,
        startRegion,
        currentRegion: startRegion,
      };

      setDragSession(session);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const dxPct = ((moveEvent.clientX - startX) / rect.width) * 100;
        const dyPct = ((moveEvent.clientY - startY) / rect.height) * 100;

        let nextX = startRegion.x;
        let nextY = startRegion.y;
        let nextW = startRegion.width;
        let nextH = startRegion.height;

        const minW = 4;
        const minH = 4;

        if (mode === 'move') {
          nextX = Math.max(0, Math.min(100 - startRegion.width, startRegion.x + dxPct));
          nextY = Math.max(0, Math.min(100 - startRegion.height, startRegion.y + dyPct));
        } else if (mode === 'se') {
          nextW = Math.max(minW, Math.min(100 - startRegion.x, startRegion.width + dxPct));
          nextH = Math.max(minH, Math.min(100 - startRegion.y, startRegion.height + dyPct));
        } else if (mode === 'sw') {
          const maxLeft = startRegion.x + startRegion.width - minW;
          nextX = Math.max(0, Math.min(maxLeft, startRegion.x + dxPct));
          nextW = startRegion.width - (nextX - startRegion.x);
          nextH = Math.max(minH, Math.min(100 - startRegion.y, startRegion.height + dyPct));
        } else if (mode === 'ne') {
          const maxTop = startRegion.y + startRegion.height - minH;
          nextY = Math.max(0, Math.min(maxTop, startRegion.y + dyPct));
          nextH = startRegion.height - (nextY - startRegion.y);
          nextW = Math.max(minW, Math.min(100 - startRegion.x, startRegion.width + dxPct));
        } else if (mode === 'nw') {
          const maxLeft = startRegion.x + startRegion.width - minW;
          const maxTop = startRegion.y + startRegion.height - minH;
          nextX = Math.max(0, Math.min(maxLeft, startRegion.x + dxPct));
          nextY = Math.max(0, Math.min(maxTop, startRegion.y + dyPct));
          nextW = startRegion.width - (nextX - startRegion.x);
          nextH = startRegion.height - (nextY - startRegion.y);
        }

        const updated: BlurRegion = {
          id: startRegion.id,
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
          width: Math.round(nextW * 10) / 10,
          height: Math.round(nextH * 10) / 10,
        };

        setDragSession((prev) => (prev ? { ...prev, currentRegion: updated } : null));
        onChangeRegion(updated);
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        setDragSession(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [onChangeRegion, onSelectRegion]
  );

  if (regions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        // If clicking on empty canvas area inside the container (not directly inside a blur box)
        if (e.target === containerRef.current) {
          onSelectRegion(null);
          onDeselectItem?.();
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 14,
        pointerEvents: selectedId ? 'auto' : 'none',
        userSelect: 'none',
      }}
    >
      {regions.map((region, idx) => {
        const isDragging = dragSession?.regionId === region.id;
        const activeRegion = isDragging && dragSession ? dragSession.currentRegion : region;
        const isSelected = selectedId === region.id;
        const isHovered = hoveredId === region.id;

        const isCircle = activeRegion.shape === 'circle' || (activeRegion.borderRadius !== undefined && activeRegion.borderRadius >= 100);
        const resolvedRadius = isCircle
          ? 9999
          : activeRegion.shape === 'rounded'
            ? (activeRegion.borderRadius ?? 24)
            : (activeRegion.borderRadius ?? 0);

        return (
          <div
            key={region.id}
            onPointerEnter={() => setHoveredId(region.id)}
            onPointerLeave={() => setHoveredId((curr) => (curr === region.id ? null : curr))}
            onPointerDown={(e) => startDrag(e, 'move', activeRegion)}
            style={{
              position: 'absolute',
              left: `${activeRegion.x}%`,
              top: `${activeRegion.y}%`,
              width: `${activeRegion.width}%`,
              height: `${activeRegion.height}%`,
              pointerEvents: 'auto',
              cursor: isSelected ? 'move' : 'pointer',
              boxSizing: 'border-box',
              border: isSelected
                ? '2px solid #3b82f6'
                : isHovered
                  ? '1.5px dashed rgba(255, 255, 255, 0.45)'
                  : '1.5px solid transparent',
              boxShadow: isSelected
                ? '0 0 0 1px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(59, 130, 246, 0.25)'
                : 'none',
              background: isSelected
                ? 'rgba(59, 130, 246, 0.12)'
                : 'transparent',
              borderRadius: resolvedRadius,
              transition: isDragging ? 'none' : 'border-color 0.15s ease',
            }}
          >
            {/* Header Badge ONLY when selected: allows deleting or seeing the box index */}
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: -24,
                  left: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: '#2563eb',
                  color: '#ffffff',
                  padding: '2px 7px',
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                  border: '1px solid #3b82f6',
                  pointerEvents: 'auto',
                }}
              >
                <Icon name="eyeOff" size={11} color="#ffffff" />
                <span>تمويه {idx + 1}</span>

                {/* Quick Shape Toggle Button */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const nextShape = activeRegion.shape === 'circle' ? 'square' : activeRegion.shape === 'rounded' ? 'circle' : 'rounded';
                    const nextRadius = nextShape === 'circle' ? 9999 : nextShape === 'rounded' ? 24 : 0;
                    onChangeRegion({
                      ...activeRegion,
                      shape: nextShape,
                      borderRadius: nextRadius,
                    });
                  }}
                  title={`تبديل الشكل: ${activeRegion.shape === 'circle' ? 'دائري' : activeRegion.shape === 'rounded' ? 'مستدير' : 'مربع'}`}
                  style={{
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.22)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: '1px 6px',
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 600,
                    marginLeft: 2,
                  }}
                >
                  {activeRegion.shape === 'circle' ? '⚪ دائري' : activeRegion.shape === 'rounded' ? '▢ مستدير' : '⬛ مربع'}
                </button>

                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onRemoveRegion(region.id);
                  }}
                  title="حذف هذا التمويه"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: '0 2px',
                    display: 'grid',
                    placeItems: 'center',
                    marginLeft: 3,
                  }}
                >
                  <Icon name="x" size={10} color="#ffffff" />
                </button>
              </div>
            )}

            {/* Corner Resize Handles ONLY when selected */}
            {isSelected && (
              <>
                {/* NW */}
                <div
                  onPointerDown={(e) => startDrag(e, 'nw', activeRegion)}
                  style={{
                    position: 'absolute',
                    top: -5,
                    left: -5,
                    width: 10,
                    height: 10,
                    background: '#ffffff',
                    border: '1.5px solid #2563eb',
                    borderRadius: 2,
                    cursor: 'nwse-resize',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                />
                {/* NE */}
                <div
                  onPointerDown={(e) => startDrag(e, 'ne', activeRegion)}
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    width: 10,
                    height: 10,
                    background: '#ffffff',
                    border: '1.5px solid #2563eb',
                    borderRadius: 2,
                    cursor: 'nesw-resize',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                />
                {/* SW */}
                <div
                  onPointerDown={(e) => startDrag(e, 'sw', activeRegion)}
                  style={{
                    position: 'absolute',
                    bottom: -5,
                    left: -5,
                    width: 10,
                    height: 10,
                    background: '#ffffff',
                    border: '1.5px solid #2563eb',
                    borderRadius: 2,
                    cursor: 'nesw-resize',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                />
                {/* SE */}
                <div
                  onPointerDown={(e) => startDrag(e, 'se', activeRegion)}
                  style={{
                    position: 'absolute',
                    bottom: -5,
                    right: -5,
                    width: 10,
                    height: 10,
                    background: '#ffffff',
                    border: '1.5px solid #2563eb',
                    borderRadius: 2,
                    cursor: 'nwse-resize',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
