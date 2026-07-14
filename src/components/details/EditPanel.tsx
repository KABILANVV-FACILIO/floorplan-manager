import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { unitById } from '../../state/selectors';
import { polyAreaM2 } from '../../lib/geometry';
import { AMENITY_ICONS, AMENITY_META, DESK_TYPES, floorImageKey, TYPE_META } from '../../lib/types';
import type { AmenityIcon, DeskType, EditTool } from '../../lib/types';
import { DEMO_ASSETS } from '../../lib/assets';
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
    id: 'amenity',
    label: 'Amenity',
    icon: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  },
  {
    id: 'asset',
    label: 'Asset',
    icon: <><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  },
  {
    id: 'calibrate',
    label: 'Calibrate',
    icon: <><path d="M4 12h16" /><path d="M4 12v4M8 12v2M12 12v4M16 12v2M20 12v4" /></>,
  },
];

const AMENITY_TOOL_ICON: Record<AmenityIcon, ReactNode> = {
  asset: <><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  fire: <path d="M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7C14 6 13 4 13 2c-3 2-4.5 4.5-4.5 7C7 8 6 7 5.5 5.5 4.5 8 5 10.5 5 12c0 6 3 10 7 10z" />,
  stairs: <path d="M3 21h4v-4h4v-4h4V9h4V5h2" />,
  elevator: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 12l2.5-3 2.5 3M9 15.5l2.5 3 2.5-3" /></>,
  restroom: <><circle cx="8" cy="5" r="2" /><path d="M8 9v6m-2.5 6v-4h5v4M6 9h4" /><circle cx="16.5" cy="5" r="2" /><path d="M16.5 9c-1.8 0-2.5 1.4-2.8 3l-.7 3h7l-.7-3c-.3-1.6-1-3-2.8-3zM15 18v3m3-3v3" /></>,
};

export function EditPanel() {
  const { state, actions } = useFloorplan();
  const sel = unitById(state, state.selected);
  const calibActive = state.tool === 'calibrate' && state.calib.length > 0;
  const calibReady = state.calib.length === 2;
  const [assetQuery, setAssetQuery] = useState('');
  const placedAssetIds = useMemo(() => new Set(state.units.filter((u) => u.assetId).map((u) => u.assetId)), [state.units]);
  const filteredAssets = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    return DEMO_ASSETS.filter((a) => !q || a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.detail.toLowerCase().includes(q));
  }, [assetQuery]);

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

      {state.tool === 'amenity' && (
        <div className={card.card}>
          <div className={card.cardHead}>
            <h3 className={card.cardTitle}>Amenity marker</h3>
          </div>
          <div className={card.cardBody}>
            <div className={styles.grid}>
              {AMENITY_ICONS.map((icon) => (
                <button
                  key={icon}
                  className={[styles.toolBtn, state.amenityIcon === icon ? styles.toolBtnActive : ''].join(' ')}
                  onClick={() => actions.setAmenityIcon(icon)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {AMENITY_TOOL_ICON[icon]}
                  </svg>
                  {AMENITY_META[icon].name}
                </button>
              ))}
            </div>
            <p className={card.helper}>Click on the plan to drop a {AMENITY_META[state.amenityIcon].name.toLowerCase()} marker.</p>
          </div>
        </div>
      )}

      {state.tool === 'asset' && (
        <div className={card.card}>
          <div className={card.cardHead}>
            <h3 className={card.cardTitle}>Assets</h3>
          </div>
          <div className={card.cardBody}>
            <input
              className={card.input}
              placeholder="Search assets"
              value={assetQuery}
              onChange={(e) => setAssetQuery(e.target.value)}
            />
            <p className={card.helper} style={{ margin: '8px 0 4px' }}>Drag an asset onto the plan to place it.</p>
            <div className={styles.assetList}>
              {filteredAssets.map((a) => {
                const placed = placedAssetIds.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={styles.assetRow}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-floorplan-asset', a.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title="Drag onto the floorplan to place"
                  >
                    <span className={styles.assetIcon}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8" />
                        <path d="M12 13v8" />
                      </svg>
                    </span>
                    <span className={styles.assetText}>
                      <span className={styles.assetName}>{a.name}</span>
                      <span className={styles.assetDetail}>{a.category} · {a.detail}</span>
                    </span>
                    {placed && (
                      <span className={styles.assetPlaced} title="Already on this plan (drag to move)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      </span>
                    )}
                  </div>
                );
              })}
              {filteredAssets.length === 0 && <p className={card.helper}>No assets match.</p>}
            </div>
          </div>
        </div>
      )}

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
                <label className={card.label} style={{ marginTop: 10 }}>
                  Desk type
                </label>
                {/* Real deskType semantics (Context/Workplace_spaceModules.md): ASSIGNED desks are
                    assignment-only; HOT/HOTEL desks are booking-only. Changing this immediately
                    regates the assign/book flows for this marker. */}
                <select
                  className={card.input}
                  value={sel.deskType ?? 'ASSIGNED'}
                  onChange={(e) => actions.updateUnit(sel.id, { deskType: e.target.value as DeskType })}
                >
                  {DESK_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.id === 'ASSIGNED' ? '— assignable, not bookable' : '— bookable, not assignable'}
                    </option>
                  ))}
                </select>
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
