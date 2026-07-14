import { useState } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { conflictsFor, employeeName, unitById } from '../../state/selectors';
import { fmtTime } from '../../lib/geometry';
import { Modal, ModalFooter, ModalHeader } from '../primitives/Modal';
import { Select } from '../primitives/Select';
import { Button } from '../primitives/Button';
import card from './Card.module.css';

const TIME_OPTIONS = Array.from({ length: (1200 - 420) / 30 + 1 }, (_, i) => 420 + i * 30).map((m) => ({ value: String(m), label: fmtTime(m) }));

export function BookingModal() {
  const { state, actions } = useFloorplan();
  const [submitting, setSubmitting] = useState(false);
  if (!state.bookModalOpen || !state.selected) return null;
  const unit = unitById(state, state.selected);
  if (!unit) return null;

  const conflicts = conflictsFor(state.bookings, unit.id, state.date, state.start, state.end);
  let error: string | null = null;
  if (state.end <= state.start) error = 'End time must be after start time';
  else if (conflicts.length) error = `Conflicts with ${fmtTime(conflicts[0].start)}–${fmtTime(conflicts[0].end)} (${employeeName(state, conflicts[0].by)})`;

  async function onConfirm() {
    setSubmitting(true);
    const ok = await actions.confirmBooking(unit!.id);
    setSubmitting(false);
    if (!ok) return;
  }

  return (
    <Modal onClose={actions.closeBookModal}>
      <ModalHeader
        title={`New booking · ${unit.label}`}
        subtitle={`${state.date} · ${fmtTime(state.start)}–${fmtTime(state.end)}`}
        onClose={actions.closeBookModal}
      />
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className={card.label}>Booked by</label>
          <Select
            value={state.bookBy}
            options={state.employees.map((e) => ({ value: e.id, label: e.name, sublabel: e.dept }))}
            onChange={(v) => actions.setBookField('bookBy', v)}
            fullWidth
            aria-label="Booked by"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className={card.label}>Date</label>
          <input className={card.input} type="date" value={state.date} onChange={(e) => actions.setDate(e.target.value)} />
        </div>
        <div>
          <label className={card.label}>Start</label>
          <Select value={String(state.start)} options={TIME_OPTIONS} onChange={(v) => actions.setTimeRange(Number(v), state.end)} fullWidth aria-label="Start" />
        </div>
        <div>
          <label className={card.label}>End</label>
          <Select value={String(state.end)} options={TIME_OPTIONS} onChange={(v) => actions.setTimeRange(state.start, Number(v))} fullWidth aria-label="End" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className={card.label}>Purpose</label>
          <input
            className={card.input}
            value={state.bookPurpose}
            placeholder="e.g. Sprint planning"
            onChange={(e) => actions.setBookField('bookPurpose', e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className={card.label}>
            Notes <span style={{ color: 'var(--ink-400)' }}>· optional</span>
          </label>
          <textarea
            className={card.input}
            style={{ height: 72, padding: '8px 10px', resize: 'vertical' }}
            value={state.bookNotes}
            placeholder="Anything facilities should know…"
            onChange={(e) => actions.setBookField('bookNotes', e.target.value)}
          />
        </div>
        {error && (
          <div style={{ gridColumn: '1 / -1', background: 'var(--danger-050)', color: 'var(--danger-700)', borderRadius: 4, padding: '10px 12px', fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={actions.closeBookModal}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!!error || submitting} style={{ opacity: error ? 0.5 : 1 }} onClick={onConfirm}>
          Confirm booking
        </Button>
      </ModalFooter>
    </Modal>
  );
}
