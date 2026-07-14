import { useEffect, useRef } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { fmtTime } from '../../lib/geometry';
import { useSheetDrag } from './useSheetDrag';
import styles from './MobileTimePicker.module.css';

// Bookings snap to 30-minute slots across the day.
const STEP = 30;
const SLOTS = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP);

export function MobileTimePicker() {
  const { state, actions } = useFloorplan();
  const sheetRef = useSheetDrag(() => actions.setMobTimePick(null), !!state.mobTimePick);
  const listRef = useRef<HTMLDivElement>(null);
  const editingStart = state.mobTimePick !== 'end';
  const current = editingStart ? state.start : state.end;

  // Open scrolled to the current selection.
  useEffect(() => {
    if (!state.mobTimePick) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-current="true"]');
    el?.scrollIntoView({ block: 'center' });
  }, [state.mobTimePick]);

  if (!state.mobTimePick) return null;

  // End options must stay after the start; picking a start keeps the duration.
  const options = editingStart ? SLOTS : SLOTS.filter((m) => m > state.start);
  const title = editingStart ? 'Start time' : 'End time';

  function pick(min: number) {
    if (editingStart) {
      const dur = Math.max(STEP, state.end - state.start);
      actions.setTimeRange(min, Math.min(24 * 60 - STEP, min + dur));
    } else {
      actions.setTimeRange(state.start, Math.max(state.start + STEP, min));
    }
    actions.setMobTimePick(null);
  }

  return (
    <div className={styles.backdrop} onClick={() => actions.setMobTimePick(null)}>
      <div ref={sheetRef} className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle} />
        <div className={styles.title}>{title}</div>
        <div className={styles.list} ref={listRef}>
          {options.map((min) => {
            const isCurrent = min === current;
            return (
              <button
                key={min}
                data-current={isCurrent}
                className={[styles.slot, isCurrent ? styles.slotActive : ''].join(' ')}
                onClick={() => pick(min)}
              >
                {fmtTime(min)}
                {isCurrent && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
