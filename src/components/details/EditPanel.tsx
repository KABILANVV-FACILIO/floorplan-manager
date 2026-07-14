import type { ReactNode } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { unitById } from '../../state/selectors';
import { polyAreaM2 } from '../../lib/geometry';
import { floorImageKey, TYPE_META } from '../../lib/types';
import type { EditTool } from '../../lib/types';
import { Button } from '../primitives/Button';
import card from './Card.module.css';
import styles from './EditPanel.module.css';

const TOOLS: { id: EditTool; label: string; icon: ReactNode }[] = [
  {
    id: 'select',
    label: 'Select',
    icon: (
      <path d="M3 3l7 18 2.5-7.5L20 11z" />
    ),
  },
  {
    id: 'room',
    label: 'Draw room',
    icon: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />,
  },
  {
    id: 'workstation',
    label: 'Desk',
    icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  },
  {
    id: 'locker',
    label: 'Locker',
    icon: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  },
  {
    id: 'parking',
    label: 'Parking stall',
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M9 8h3.5a2.5 2.5 0 0 1 0 5H9" /></>,
  },
  {
    id: 'calibrate',
    label: 'Calibrate',
    icon: <><path d="M4 12h16" /><path d="M4 12v4M8 12v2M12 12v4M16 12v2M20 12v4" /></>,
  },
];

export function EditPanel() {
  const { state, actions } = useFloorplan();
  const sel = unitById(state, state.selected);
  const calibActive = state.tool === 'calibrate' && state.calib.length > 0;
  const calibReady = state.calib.length === 2;

  return (
    <div className={styles.stack}>
      <div className={card.card}>
        <div className={card.cardHead}>
          <h3 className={card.cardTitle}>Tools</h3>
        </div>
        <div className={card.cardBody}>
          <div className={styles.grid}>
            {TOOLS.map((t) => (
              <button key={t.id} className={[styles.toolBtn, state.tool === t.id ? styles.toolBtnActive : ''].join(' ')} onClick={() => actions.setTool(t.id)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {t.icon}
                </svg>
                {t.label}
              </button>
            ))}
          </div>
          <p className={card.helper}>Draw room: click to add points, click the first point (or press Enter) to close. Press Esc to cancel.</p>
        </div>
      </div>

      <div className={card.card}>
        <div className={card.cardBody}>
          <Button variant="secondary" fullWidth onClick={() => actions.setUploadOpen(true)}>
            Upload / replace floorplan image
          </Button>
          {(() => {
            // Only offered when this floor/plan's image came from a CAD file
            // analyzed this session — image-only plans have no metadata to map.
            const cadGroups = state.cadAnalyses[floorImageKey(state.floorId, state.planId)];
            if (!cadGroups?.length) return null;
            return (
              <div style={{ marginTop: 8 }}>
                <Button variant="secondary" fullWidth onClick={() => actions.openAutoMap(cadGroups)}>
                  Auto-map CAD units
                </Button>
                <p className={card.helper} style={{ marginTop: 6 }}>
                  Re-runs the layer/block mapping from the uploaded CAD file. Mapping again adds new
                  units — discard or delete the earlier batch first if you don't want duplicates.
                </p>
              </div>
            );
          })()}
        </div>
      </div>

      {calibActive && (
        <div className={card.card}>
          <div className={card.cardHead}>
            <h3 className={card.cardTitle}>Calibration</h3>
          </div>
          <div className={card.cardBody}>
            {!calibReady ? (
              <p className={card.helper}>Click two points on the plan a known real-world distance apart.</p>
            ) : (
              <div className={styles.calibRow}>
                <input
                  className={card.input}
                  type="number"
                  min={0.1}
                  step={0.1}
                  placeholder="Distance in meters"
                  value={state.calibLen}
                  onChange={(e) => actions.setCalibLen(e.target.value)}
                />
                <Button variant="primary" onClick={actions.applyCalib} disabled={!(parseFloat(state.calibLen) > 0)}>
                  Apply
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {sel && (
        <div className={card.card}>
          <div className={card.cardHead}>
            <h3 className={card.cardTitle}>Selection</h3>
          </div>
          <div className={card.cardBody}>
            <label className={card.label}>Label</label>
            <input className={card.input} value={sel.label} onChange={(e) => actions.updateUnit(sel.id, { label: e.target.value })} />
            {sel.type === 'workstation' && (
              <>
                <label className={card.label} style={{ marginTop: 10 }}>
                  Seat type
                </label>
                <input className={card.input} value={sel.secondary ?? ''} onChange={(e) => actions.updateUnit(sel.id, { secondary: e.target.value })} />
              </>
            )}
            <div className={card.statRow}>
              <span className={card.statLabel}>Type</span>
              <span className={card.statValue}>{TYPE_META[sel.type].name}</span>
            </div>
            {sel.room && (
              <div className={card.statRow}>
                <span className={card.statLabel}>Room</span>
                <span className={card.statValue}>{sel.room}</span>
              </div>
            )}
            {sel.geom.kind === 'poly' && (
              <div className={card.statRow}>
                <span className={card.statLabel}>Area</span>
                <span className={card.statValue}>
                  {(() => {
                    const a = polyAreaM2(sel.geom.pts, state.pxPerMeter);
                    return a != null ? `${a.toFixed(1)} m²` : 'Calibrate to see area';
                  })()}
                </span>
              </div>
            )}
            <pre className={styles.geomPreview}>{JSON.stringify(sel.geom, null, 0)}</pre>
            <Button variant="danger" fullWidth style={{ marginTop: 10 }} onClick={() => actions.deleteUnit(sel.id)}>
              Delete unit
            </Button>
          </div>
        </div>
      )}

      <div className={card.card}>
        <div className={card.cardBody}>
          <p className={card.helper}>
            Placing, editing, and deleting units already saves immediately — the "Save changes" bar above the canvas confirms it explicitly.
          </p>
          <Button variant="secondary" fullWidth onClick={actions.resetDemo}>
            Reset demo data
          </Button>
        </div>
      </div>
    </div>
  );
}
