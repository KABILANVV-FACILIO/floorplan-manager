import { useFloorplan } from '../../state/FloorplanContext';
import { ACTIONS, ROLES, STATE_DEFS, STATE_SWATCHES } from '../../lib/types';
import type { PermsAction, Role, UnitType } from '../../lib/types';
import { Button } from '../primitives/Button';
import { moduleColor } from '../../lib/unitStatus';
import styles from './SettingsScreen.module.css';

const MODULE_TABS: { id: 'permissions' | UnitType; name: string }[] = [
  { id: 'permissions', name: 'Roles & access' },
  { id: 'workstation', name: 'Desks' },
  { id: 'locker', name: 'Lockers' },
  { id: 'parking', name: 'Parking' },
  { id: 'room', name: 'Rooms' },
];

const SLOT_OPTIONS = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
];

export function SettingsScreen() {
  const { state, actions } = useFloorplan();

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <div className={styles.headRow}>
          <div>
            <div className={styles.eyebrow}>Workplace administration</div>
            <h1 className={styles.h1}>Settings</h1>
          </div>
          <Button variant="secondary" onClick={actions.openMap}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to floorplan
          </Button>
        </div>

        <div className={styles.tabs}>
          {MODULE_TABS.map((t) => (
            <button
              key={t.id}
              className={[styles.tab, state.settingsTab === t.id ? styles.tabActive : ''].join(' ')}
              onClick={() => actions.setSettingsTab(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>

        {state.settingsTab === 'permissions' ? <PermissionsTab /> : <ModuleTab type={state.settingsTab} />}
      </div>
    </div>
  );
}

function PermissionsTab() {
  const { state, actions } = useFloorplan();
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h3 className={styles.cardTitle}>Roles &amp; access</h3>
          <p className={styles.cardDesc}>Choose which roles can perform each action. Changes apply immediately and are saved for your workspace.</p>
        </div>
        <Button variant="secondary" onClick={actions.resetPerms}>
          Reset to defaults
        </Button>
      </div>
      <div className={styles.matrixHead}>
        <span>Action</span>
        {ROLES.map((r) => (
          <span key={r.id} className={styles.matrixHeadCell}>
            {r.name}
          </span>
        ))}
      </div>
      {ACTIONS.map((a) => (
        <div key={a.id} className={styles.matrixRow}>
          <div>
            <div className={styles.rowName}>{a.name}</div>
            <div className={styles.rowDesc}>{a.desc}</div>
          </div>
          {ROLES.map((r) => (
            <div key={r.id} className={styles.switchCell}>
              <PermSwitch action={a.id} role={r.id} />
            </div>
          ))}
        </div>
      ))}
      <div className={styles.footNote}>
        You are currently viewing the app as <b>{ROLES.find((r) => r.id === state.role)?.name}</b>. Switch roles from the left sidebar to preview
        what each role can do.
      </div>
    </div>
  );
}

function PermSwitch({ action, role }: { action: PermsAction; role: Role }) {
  const { state, actions } = useFloorplan();
  const on = state.perms[action].includes(role);
  return (
    <button className={[styles.switch, on ? styles.switchOn : ''].join(' ')} onClick={() => actions.togglePerm(action, role)}>
      <span className={styles.knob} style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

function ModuleTab({ type }: { type: UnitType }) {
  const { state, actions } = useFloorplan();
  const defs = STATE_DEFS[type];
  const showSlot = type !== 'locker';

  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>States &amp; color coding</h3>
          <p className={styles.cardDesc}>Pick the color used on the floorplan and legend for each state.</p>
        </div>
        {defs.map((s) => (
          <div key={s.key} className={styles.stateRow}>
            <span className={styles.stateSwatch} style={{ background: moduleColor(state, type, s.key) }} />
            <div className={styles.stateText}>
              <div className={styles.rowName}>{s.label}</div>
              <div className={styles.rowDesc}>{s.desc}</div>
            </div>
            <div className={styles.swatchRow}>
              {STATE_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  title={hex}
                  className={styles.swatchBtn}
                  style={{
                    background: hex,
                    boxShadow: moduleColor(state, type, s.key) === hex ? '0 0 0 2px #fff, 0 0 0 4px var(--blue-500)' : 'none',
                  }}
                  onClick={() => actions.setModuleColor(`${type}.${s.key}`, hex)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showSlot && (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Default slot length</h3>
            <p className={styles.cardDesc}>New bookings start at this length. Drag the calendar edges to fine-tune any booking.</p>
          </div>
          <div className={styles.slotRow}>
            {SLOT_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                className={[styles.slotChip, state.slotGranularity === o.minutes ? styles.slotChipActive : ''].join(' ')}
                onClick={() => actions.setSlotGranularity(o.minutes)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
