import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { employeeName } from '../../state/selectors';
import { markerStyle, unitStatus } from '../../lib/unitStatus';
import type { PointGeom, Unit } from '../../lib/types';

const ICONS = {
  workstation: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  locker: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  parking: <span style={{ font: '700 11px/1 var(--font-sans)' }}>P</span>,
};

export function Marker({ unit, invZ }: { unit: Unit; invZ: number }) {
  const { state, actions } = useFloorplan();
  const geom = unit.geom as PointGeom;
  const style = markerStyle(state, unit);
  const status = unitStatus(state, unit, (id) => employeeName(state, id));

  function onClick(e: ReactMouseEvent) {
    e.stopPropagation();
    if (state.mode === 'edit' && state.tool !== 'select') return;
    actions.selectUnit(unit.id);
  }

  function onDragOver(e: ReactDragEvent) {
    if (state.mode !== 'assign') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (state.dragOverId !== unit.id) actions.dragOverUnit(unit.id);
  }
  function onDragLeave() {
    if (state.dragOverId === unit.id) actions.dragOverUnit(null);
  }
  function onDrop(e: ReactDragEvent) {
    if (state.mode !== 'assign') return;
    e.preventDefault();
    const empId = state.dragEmpId || e.dataTransfer.getData('text/plain');
    if (empId) actions.assign(empId, unit.id);
  }

  const title = `${unit.label}${unit.room ? ' · ' + unit.room : ''} — ${status.text}`;

  return (
    <div
      title={title}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'absolute',
        left: `${geom.x * 100}%`,
        top: `${geom.y * 100}%`,
        width: style.size,
        height: style.size,
        transform: `translate(-50%,-50%) scale(${invZ})`,
        background: style.bg,
        border: `2px solid ${style.bd}`,
        color: style.fg,
        borderRadius: style.radius,
        boxShadow: style.shadow,
        opacity: style.opacity,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: style.zIndex,
      }}
    >
      {style.occText && <span style={{ font: '700 9px/1 var(--font-sans)' }}>{style.occText}</span>}
      {!style.occText && style.icon && ICONS[style.icon]}
    </div>
  );
}
