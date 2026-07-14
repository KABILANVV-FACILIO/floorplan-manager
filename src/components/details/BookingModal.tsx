import { useState } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { unitById } from '../../state/selectors';
import { fmtTime } from '../../lib/geometry';
import type { Employee, UnitType } from '../../lib/types';
import { Modal, ModalFooter, ModalHeader } from '../primitives/Modal';
import { Select } from '../primitives/Select';
import { Button } from '../primitives/Button';
import card from './Card.module.css';

/** Resource-field label per unit type, in space-booking mode (matches the real Facilio forms). */
const SPACE_RESOURCE_LABEL: Record<UnitType, string> = { workstation: 'Desk', parking: 'Parking', room: 'Location', locker: 'Locker', amenity: 'Amenity' };
const SPACE_FORM_NAME: Record<UnitType, string> = {
  workstation: 'Desk Booking Form',
  parking: 'Parking Booking Form',
  room: 'Space Booking Form',
  locker: 'Locker Form',
  amenity: 'Space Booking Form',
};
const FACILITY_FORM_NAME: Record<UnitType, string> = {
  workstation: 'Hot Desk Booking',
  parking: 'Parking Booking',
  room: 'Space Booking',
  locker: 'Locker Booking',
  amenity: 'Space Booking',
};

function toLocalInput(dateISO: string, minutes: number): string {
  return `${dateISO}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function fromLocalInput(v: string): { date: string; minutes: number } {
  const [d, t] = v.split('T');
  const [h, m] = (t ?? '0:0').split(':').map(Number);
  return { date: d, minutes: (h || 0) * 60 + (m || 0) };
}

export function BookingModal() {
  const { state } = useFloorplan();
  if (!state.bookForm) return null;
  const target = state.bookForm;
  // Remount (fresh field state) whenever the form opens for a different resource/window.
  return <BookingFormInner key={`${target.unitId}:${target.date}:${target.start}:${target.end}`} />;
}

function BookingFormInner() {
  const { state, actions } = useFloorplan();
  const target = state.bookForm!;
  const unit = unitById(state, target.unitId);
  const module = state.bookingModule;
  const employees = state.employees;

  const defaultEmp = employees.some((e) => e.id === state.bookBy) ? state.bookBy : employees[0]?.id ?? '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [host, setHost] = useState(defaultEmp);
  const [reservedBy, setReservedBy] = useState(defaultEmp);
  const [noOfAttendees, setNoOfAttendees] = useState('1');
  const [startInput, setStartInput] = useState(toLocalInput(target.date, target.start));
  const [endInput, setEndInput] = useState(toLocalInput(target.date, target.end));
  const [internalAttendees, setInternalAttendees] = useState<string[]>([]);
  const [externalAttendees, setExternalAttendees] = useState<string[]>([]);
  // Facility mode books a discrete slot: a date + a start minute (slot length = slotGranularity).
  const [slotDate, setSlotDate] = useState(target.date);
  const [slotStart, setSlotStart] = useState<number | null>(target.start);
  const [submitting, setSubmitting] = useState(false);

  if (!unit) return null;

  const isFacility = module === 'facility';
  const isRoom = unit.type === 'room';
  const resourceFieldLabel = isFacility ? 'Facility' : SPACE_RESOURCE_LABEL[unit.type];
  const formName = isFacility ? FACILITY_FORM_NAME[unit.type] : SPACE_FORM_NAME[unit.type];
  const reserverLabel = isFacility ? 'Reserved For' : 'Reserved By';

  const slotLen = state.slotGranularity;
  const slots = Array.from({ length: (18 * 60 - 8 * 60) / slotLen }, (_, i) => 8 * 60 + i * slotLen);

  const empOptions = employees.map((e) => ({ value: e.id, label: e.name, sublabel: e.dept }));

  async function onSubmit() {
    const s = fromLocalInput(startInput);
    const e = fromLocalInput(endInput);
    let date = s.date;
    let start = s.minutes;
    let end = e.minutes;
    if (isFacility) {
      if (slotStart == null) {
        actions.showToast('Pick a time slot');
        return;
      }
      date = slotDate;
      start = slotStart;
      end = slotStart + slotLen;
    }
    setSubmitting(true);
    const ok = await actions.submitBooking({
      unitId: unit!.id,
      date,
      start,
      end,
      name: name.trim() || `${unit!.label} booking`,
      description: description.trim(),
      host,
      reservedBy,
      noOfAttendees: Number(noOfAttendees) || 1,
      internalAttendees,
      externalAttendees,
    });
    setSubmitting(false);
    if (ok) actions.closeBookingForm();
  }

  return (
    <Modal onClose={actions.closeBookingForm} width={560}>
      <ModalHeader
        title={isFacility ? 'Booking' : 'Space Booking'}
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ padding: '3px 10px', borderRadius: 6, background: 'var(--ink-050)', border: '1px solid var(--ink-200)', fontSize: 12, color: 'var(--ink-700)' }}>{formName}</span>
          </span>
        }
        onClose={actions.closeBookingForm}
      />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '64vh', overflowY: 'auto' }}>
        {!isFacility && (
          <>
            <Field label="Name" required>
              <input className={card.input} value={name} placeholder="Enter your text here" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea
                className={card.input}
                style={{ height: 72, padding: '8px 10px', resize: 'vertical' }}
                value={description}
                placeholder="Type your description here"
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="Host" required>
              <Select value={host || null} options={empOptions} onChange={setHost} placeholder="Select an option" fullWidth aria-label="Host" />
            </Field>
          </>
        )}

        <Field label={reserverLabel} required>
          <Select value={reservedBy || null} options={empOptions} onChange={setReservedBy} placeholder="Select an option" fullWidth aria-label={reserverLabel} />
        </Field>

        <Field label={resourceFieldLabel} required>
          <div className={card.input} style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-900)', background: 'var(--ink-050)' }}>
            {unit.label}
            {unit.secondary ? <span style={{ color: 'var(--ink-500)', marginLeft: 6 }}>· {unit.secondary}</span> : null}
          </div>
        </Field>

        <Field label="Number Of Attendees" required>
          <input className={card.input} type="number" min={1} value={noOfAttendees} placeholder="Input numerical value" onChange={(e) => setNoOfAttendees(e.target.value)} />
        </Field>

        {!isFacility ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Start Time" required>
              <input className={card.input} type="datetime-local" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
            </Field>
            <Field label="End Time" required>
              <input className={card.input} type="datetime-local" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="Time Slots" required>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div className={card.label}>Select Date</div>
                <input className={card.input} type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} />
              </div>
              <div>
                <div className={card.label}>Time Slot</div>
                <div className={card.input} style={{ display: 'flex', alignItems: 'center', color: slotStart != null ? 'var(--ink-900)' : 'var(--ink-400)' }}>
                  {slotStart != null ? `${fmtTime(slotStart)} – ${fmtTime(slotStart + slotLen)}` : 'Pick a slot'}
                </div>
              </div>
            </div>
            <div className={card.label} style={{ marginTop: 12, color: 'var(--blue-600)' }}>Available Slots</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {slots.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSlotStart(m)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${slotStart === m ? 'var(--blue-500)' : 'var(--ink-200)'}`,
                    background: slotStart === m ? 'var(--blue-025)' : '#fff',
                    color: slotStart === m ? 'var(--blue-600)' : 'var(--ink-700)',
                    font: '500 12px/1 var(--font-sans)',
                    cursor: 'pointer',
                  }}
                >
                  {fmtTime(m)}
                </button>
              ))}
            </div>
          </Field>
        )}

        {(isFacility || isRoom) && (
          <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 12 }}>
            <div style={{ font: '700 12px/1 var(--font-sans)', color: 'var(--ink-700)', letterSpacing: '0.03em', marginBottom: 10 }}>ATTENDEES</div>
            <Field label="Internal Attendees">
              <AttendeePicker employees={employees} selected={internalAttendees} onChange={setInternalAttendees} placeholder="Select one or more options" />
            </Field>
          </div>
        )}
        {!isFacility && isRoom && (
          <Field label="External Attendees">
            <AttendeePicker employees={employees} selected={externalAttendees} onChange={setExternalAttendees} placeholder="Select one or more options" />
          </Field>
        )}
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={actions.closeBookingForm}>Cancel</Button>
        <Button variant="primary" disabled={submitting} onClick={onSubmit}>Submit Details</Button>
      </ModalFooter>
    </Modal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={card.label}>
        {required && <span style={{ color: 'var(--danger-500)', marginRight: 3 }}>*</span>}
        {label}
      </label>
      {children}
    </div>
  );
}

function AttendeePicker({
  employees,
  selected,
  onChange,
  placeholder,
}: {
  employees: Employee[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const available = employees.filter((e) => !selected.includes(e.id));
  return (
    <div>
      <Select
        value={null}
        options={available.map((e) => ({ value: e.id, label: e.name, sublabel: e.dept }))}
        onChange={(v) => onChange([...selected, v])}
        placeholder={placeholder}
        fullWidth
        aria-label="Add attendee"
      />
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {selected.map((id) => {
            const e = employees.find((x) => x.id === id);
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 10px', borderRadius: 999, background: 'var(--blue-025)', border: '1px solid var(--blue-200)', font: '500 12px/1 var(--font-sans)', color: 'var(--blue-700)' }}>
                {e?.name ?? id}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                  style={{ border: 'none', background: 'transparent', color: 'var(--blue-600)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                  aria-label={`Remove ${e?.name ?? id}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
