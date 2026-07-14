import { useFloorplan } from '../../state/FloorplanContext';
import { floorMeta } from '../../state/selectors';
import { fmtTime } from '../../lib/geometry';
import { FloorplanBackground } from '../canvas/FloorplanBackground';
import { MobileFloorPicker } from './MobileFloorPicker';
import { MobileUnitSheet } from './MobileUnitSheet';
import { MobileTimePicker } from './MobileTimePicker';
import { unitStatus } from '../../lib/unitStatus';
import { employeeName, myAssignedUnit } from '../../state/selectors';
import styles from './MobileApp.module.css';

interface MobileAppProps {
  mode: 'page' | 'docked' | 'fullscreen';
  onClose?: () => void;
}

export function MobileApp({ mode, onClose }: MobileAppProps) {
  const { state, actions } = useFloorplan();
  const meta = floorMeta(state, state.floorId);
  const hasPlan = !!meta?.floor.hasPlan;
  const myUnit = myAssignedUnit(state);

  const rooms = state.units.filter((u) => u.type === 'room' && u.geom.kind === 'poly');
  const markers = state.units.filter((u) => u.type !== 'room' && u.geom.kind === 'point');

  const legend =
    state.mobileTab === 'assign'
      ? [
          { label: 'Free', color: 'var(--success-500)' },
          { label: 'Assigned', color: 'var(--blue-500)' },
        ]
      : [
          { label: 'Available', color: 'var(--success-500)' },
          { label: 'Booked', color: 'var(--danger-500)' },
        ];

  const outerClass = mode === 'page' ? styles.page : mode === 'fullscreen' ? styles.fullscreen : styles.docked;

  return (
    <div className={[styles.outer, outerClass].join(' ')}>
      {mode === 'fullscreen' && (
        <div className={styles.chromeRow}>
          <span className={styles.chromeBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <path d="M11 18h2" />
            </svg>
            Mobile preview
          </span>
          <button className={styles.chromeClose} onClick={onClose} title="Close mobile preview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className={mode === 'page' ? styles.bezelless : styles.bezel}>
        <div className={styles.screen}>
          {mode !== 'page' && (
            <div className={styles.statusBar}>
              <span>9:41</span>
              <span className={styles.notch} />
            </div>
          )}

          <div className={styles.header}>
            <div className={styles.headerRow}>
              <button className={styles.floorSwitch} onClick={() => actions.setMobFloorOpen(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="2" width="16" height="20" rx="1" />
                  <path d="M4 8h16M4 13h16M4 18h16" />
                </svg>
                <span className={styles.floorLabel}>{meta ? `${meta.floor.name} · ${meta.building.name}` : 'Choose floor'}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {myUnit ? (
                <button className={styles.locateBtn} onClick={() => actions.setMobSel(myUnit.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                  Locate
                </button>
              ) : (
                <span className={styles.dateStatic}>{new Date(state.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              )}
            </div>

            <div className={styles.tabs}>
              <button className={state.mobileTab === 'book' ? styles.tabActive : styles.tab} onClick={() => actions.setMobileTab('book')}>
                Book
              </button>
              <button className={state.mobileTab === 'assign' ? styles.tabActive : styles.tab} onClick={() => actions.setMobileTab('assign')}>
                Assign
              </button>
            </div>

            {state.mobileTab === 'book' && (
              <div className={styles.slotPicker}>
                <div className={styles.slotDateRow}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-500)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="17" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <input className={styles.dateInput} type="date" value={state.date} onChange={(e) => actions.setDate(e.target.value)} />
                </div>
                <div className={styles.slotTimeRow}>
                  <TimeField label="Start" value={state.start} active={state.mobTimePick === 'start'} onClick={() => actions.setMobTimePick(state.mobTimePick === 'start' ? null : 'start')} />
                  <TimeField label="End" value={state.end} active={state.mobTimePick === 'end'} onClick={() => actions.setMobTimePick(state.mobTimePick === 'end' ? null : 'end')} />
                </div>
              </div>
            )}
          </div>

          <div className={styles.body}>
            {hasPlan ? (
              <div className={styles.mapCard}>
                <FloorplanBackground imageUrl={state.floorImages[state.floorId]} />
                <svg className={styles.roomOverlay} viewBox="0 0 1492 1054" preserveAspectRatio="none">
                  {rooms.map((r) =>
                    r.geom.kind === 'poly' ? (
                      <polygon
                        key={r.id}
                        points={r.geom.pts.map(([x, y]) => `${x * 1492},${y * 1054}`).join(' ')}
                        fill={roomFill(state.mode, state.bookings, r.id, state.date, state.start, state.end)}
                      />
                    ) : null
                  )}
                </svg>
                {markers.map((m) =>
                  m.geom.kind === 'point' ? (
                    <button
                      key={m.id}
                      className={styles.dot}
                      style={{
                        left: `${m.geom.x * 100}%`,
                        top: `${m.geom.y * 100}%`,
                        background: dotColorFor(state, m, (id) => employeeName(state, id)),
                        boxShadow: state.mobSel === m.id ? '0 0 0 4px rgba(0,89,214,0.35)' : '0 0 0 2px #fff',
                      }}
                      onClick={() => actions.setMobSel(m.id)}
                    />
                  ) : null
                )}
                <span className={styles.countPill}>{markers.length} spaces · tap a pin</span>
                <div className={styles.legend}>
                  {legend.map((l) => (
                    <span key={l.label} className={styles.legendChip}>
                      <span className={styles.legendDot} style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.noPlan}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--ink-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3L4 5v16l5-2 6 2 5-2V3l-5 2-6-2z M9 3v16M15 5v16" />
                </svg>
                <div className={styles.noPlanTitle}>No floorplan for this floor</div>
                <div className={styles.noPlanSub}>Choose another floor from the switcher above.</div>
              </div>
            )}
          </div>

          <MobileTimePicker />
          <MobileFloorPicker />
          <MobileUnitSheet />

          <div className={styles.bottomBar}>
            <div className={[styles.bottomItem, styles.bottomItemActive].join(' ')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3L4 5v16l5-2 6 2 5-2V3l-5 2-6-2z M9 3v16M15 5v16" />
              </svg>
              <span>Map</span>
            </div>
            <div className={styles.bottomItem}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span>Bookings</span>
            </div>
            <div className={styles.bottomItem}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              <span>Me</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeField({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className={styles.timeFieldLabel}>{label}</div>
      <button className={[styles.timeFieldBtn, active ? styles.timeFieldBtnActive : ''].join(' ')} onClick={onClick}>
        <span>{fmtTime(value)}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

function roomFill(mode: string, bookings: any[], unitId: string, date: string, start: number, end: number) {
  if (mode === 'book') {
    const booked = bookings.some((b) => b.unitId === unitId && b.date === date && b.start < end && b.end > start);
    return booked ? 'rgba(182,25,25,0.18)' : 'rgba(41,160,30,0.16)';
  }
  return 'rgba(96,119,150,0.1)';
}

function dotColorFor(state: any, unit: any, employeeName: (id: string) => string) {
  const status = unitStatus(state, unit, employeeName);
  if (state.mobileTab === 'assign') {
    if (unit.type === 'room') return 'var(--ink-300)';
    return status.key === 'assigned' ? 'var(--blue-500)' : 'var(--success-500)';
  }
  if (!['workstation', 'room', 'parking'].includes(unit.type)) return 'var(--ink-300)';
  return status.key === 'booked' ? 'var(--danger-500)' : 'var(--success-500)';
}
