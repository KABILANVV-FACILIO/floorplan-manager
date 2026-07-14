import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { polyAreaM2, polygonCentroid, toNorm } from '../../lib/geometry';
import { IMG_H, IMG_W } from '../../lib/mockData';
import { FloorplanBackground } from './FloorplanBackground';
import { RoomPolygon } from './RoomPolygon';
import { Marker } from './Marker';
import { DraftOverlay } from './DraftOverlay';
import { Legend } from './Legend';
import { ZoomControls } from './ZoomControls';
import { Tooltip } from './Tooltip';
import type { PolyGeom } from '../../lib/types';
import styles from './Canvas.module.css';

const DRAW_TOOLS = new Set(['room', 'workstation', 'locker', 'parking', 'calibrate']);

export function Canvas() {
  const { state, actions } = useFloorplan();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ w: 1200, h: 700 });
  const panRef = useRef<{ sx: number; sy: number; otx: number; oty: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const userZoomedRef = useRef(state.userZoomed);
  userZoomedRef.current = state.userZoomed;

  const isDrawTool = state.mode === 'edit' && DRAW_TOOLS.has(state.tool);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width < 20) return;
      setRect({ w: r.width, h: r.height });
      actions.setStageSize(r.width, r.height);
      if (!userZoomedRef.current) actions.fitView(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.floorId, state.planId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      actions.zoomAtPoint(factor, e.clientX - r.left, e.clientY - r.top);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        if (state.draft.length || state.calib.length) {
          actions.clearDraft();
          actions.clearCalib();
        } else {
          actions.selectUnit(null);
          actions.setTool('select');
        }
      } else if (e.key === 'Enter') {
        if (state.mode === 'edit' && state.tool === 'room' && state.draft.length >= 3) actions.closeDraft();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.mode === 'edit' && state.selected) actions.deleteUnit(state.selected);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.draft, state.calib, state.mode, state.tool, state.selected]);

  function onMouseDown(e: ReactMouseEvent) {
    if (isDrawTool) return;
    if (e.button !== 0) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, otx: state.view.tx, oty: state.view.ty, moved: false };
    window.addEventListener('mousemove', onPanMove);
    window.addEventListener('mouseup', onPanUp);
  }
  function onPanMove(e: MouseEvent) {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) p.moved = true;
    actions.setView({ ...state.view, tx: p.otx + dx, ty: p.oty + dy });
  }
  function onPanUp() {
    window.removeEventListener('mousemove', onPanMove);
    window.removeEventListener('mouseup', onPanUp);
    if (panRef.current?.moved) {
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
    }
    panRef.current = null;
  }

  function onClick(e: ReactMouseEvent) {
    if (suppressClickRef.current) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const n = toNorm(e.clientX, e.clientY, r, state.view);

    if (!isDrawTool) {
      actions.selectUnit(null);
      return;
    }
    if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;

    if (state.tool === 'calibrate') {
      if (state.calib.length < 2) actions.pushCalibPoint([n.x, n.y]);
      return;
    }
    if (state.tool === 'room') {
      if (actions.isNearFirstDraftPoint([n.x, n.y])) {
        actions.closeDraft();
      } else {
        actions.pushDraftPoint([n.x, n.y]);
      }
      return;
    }
    if (state.tool === 'workstation' || state.tool === 'locker' || state.tool === 'parking') {
      actions.placePoint(state.tool, n.x, n.y);
    }
  }

  function onDblClick() {
    if (state.mode === 'edit' && state.tool === 'room' && state.draft.length >= 3) actions.closeDraft();
  }

  const invZ = (1 / state.view.z).toFixed(4);
  const planeTransition = state.viewAnim ? 'transform 340ms cubic-bezier(0.2,0,0,1)' : 'none';

  const rooms = state.units.filter((u) => u.type === 'room');
  const markers = state.units.filter((u) => u.type !== 'room' && u.plan === state.planId);

  let canvasHint = '';
  if (state.mode === 'edit') {
    if (state.tool === 'room') canvasHint = state.draft.length === 0 ? 'Click to start a room outline' : 'Click to add points · click the first point (or press Enter) to close';
    else if (state.tool === 'calibrate') canvasHint = state.calib.length === 0 ? 'Click two points a known distance apart' : state.calib.length === 1 ? 'Click the second point' : 'Enter the real-world distance in the panel';
    else if (state.tool !== 'select') canvasHint = 'Click on the plan to place it';
  }

  return (
    <div
      ref={wrapRef}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDblClick}
      className={styles.wrap}
      style={{ cursor: isDrawTool ? 'crosshair' : 'grab' }}
    >
      <div
        className={styles.plane}
        style={{
          width: IMG_W,
          height: IMG_H,
          transform: `translate(${state.view.tx}px, ${state.view.ty}px) scale(${state.view.z})`,
          transition: planeTransition,
          ['--inv' as any]: invZ,
        }}
      >
        <FloorplanBackground imageUrl={state.floorImages[state.floorId]} />
        {rooms.map((r) => (
          <RoomPolygon key={r.id} unit={r} />
        ))}
        <DraftOverlay draft={state.draft} calib={state.calib} />
        {rooms.map((r) => (
          <RoomLabel key={r.id} unitId={r.id} />
        ))}
        {markers.map((m) => (
          <Marker key={m.id} unit={m} invZ={Number(invZ)} />
        ))}
      </div>

      <Tooltip />

      {canvasHint && <div className={styles.hint}>{canvasHint}</div>}

      <Legend />
      <ZoomControls rectW={rect.w} rectH={rect.h} />
    </div>
  );
}

function RoomLabel({ unitId }: { unitId: string }) {
  const { state } = useFloorplan();
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit || unit.geom.kind !== 'poly') return null;
  const geom = unit.geom as PolyGeom;
  const { x, y } = polygonCentroid(geom.pts);

  let sub = '';
  let subFg = 'var(--ink-600)';
  if (state.mode === 'edit') {
    const area = polyAreaM2(geom.pts, state.pxPerMeter);
    sub = area != null ? `${area.toFixed(0)} m²` : '';
  } else if (state.mode === 'book') {
    const conflicts = state.bookings.filter((b) => b.unitId === unit.id && b.date === state.date && b.start < state.end && b.end > state.start);
    if (conflicts.length) {
      const b = conflicts[0];
      sub = `Booked ${String(Math.floor(b.start / 60)).padStart(2, '0')}:${String(b.start % 60).padStart(2, '0')}–${String(Math.floor(b.end / 60)).padStart(2, '0')}:${String(b.end % 60).padStart(2, '0')}`;
      subFg = 'var(--danger-700)';
    } else {
      sub = 'Available';
      subFg = 'var(--success-700)';
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%,-50%) scale(var(--inv))',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span style={{ background: '#fff', color: 'var(--ink-900)', border: '1px solid var(--ink-200)', borderRadius: 4, padding: '3px 8px', font: '600 11px/1 var(--font-sans)', boxShadow: 'var(--shadow-xs)', whiteSpace: 'nowrap' }}>
        {unit.label}
      </span>
      {sub && (
        <span style={{ background: 'rgba(255,255,255,0.92)', color: subFg, borderRadius: 4, padding: '2px 6px', font: '500 10px/1 var(--font-sans)', whiteSpace: 'nowrap' }}>
          {sub}
        </span>
      )}
    </div>
  );
}
