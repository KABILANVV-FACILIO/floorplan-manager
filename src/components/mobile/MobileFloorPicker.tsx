import { useFloorplan } from '../../state/FloorplanContext';
import styles from './MobileFloorPicker.module.css';

export function MobileFloorPicker() {
  const { state, actions } = useFloorplan();
  if (!state.mobFloorOpen) return null;

  const site = state.portfolio.find((s) => s.id === state.mobPickSite);
  const building = site?.buildings.find((b) => b.id === state.mobPickBuilding);

  let title = 'Choose a site';
  let rows: { id: string; name: string; sub: string; active?: boolean; showChevron?: boolean; onTap: () => void }[] = [];

  if (!site) {
    title = 'Choose a site';
    rows = state.portfolio.map((s) => ({
      id: s.id,
      name: s.name,
      sub: `${s.buildings.length} building${s.buildings.length === 1 ? '' : 's'}`,
      showChevron: true,
      onTap: () => actions.setMobPick(s.id, null),
    }));
  } else if (!building) {
    title = site.name;
    rows = site.buildings.map((b) => ({
      id: b.id,
      name: b.name,
      sub: `${b.floors.length} floor${b.floors.length === 1 ? '' : 's'}`,
      showChevron: true,
      onTap: () => actions.setMobPick(site.id, b.id),
    }));
  } else {
    title = building.name;
    rows = building.floors.map((f) => ({
      id: f.id,
      name: f.name,
      sub: f.hasPlan ? '' : 'No plan',
      active: state.floorId === f.id,
      onTap: () => {
        actions.selectFloor(f.id);
        actions.setMobFloorOpen(false);
      },
    }));
  }

  const canBack = !!site;
  function onBack() {
    if (building) actions.setMobPick(site!.id, null);
    else actions.setMobPick(null, null);
  }

  return (
    <>
      <div className={styles.backdrop} onClick={() => actions.setMobFloorOpen(false)} />
      <div className={styles.sheet}>
        <div className={styles.handle} />
        <div className={styles.headRow}>
          {canBack && (
            <button className={styles.back} onClick={onBack} title="Back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <span className={styles.title}>{title}</span>
        </div>
        <div className={styles.list}>
          {rows.map((r) => (
            <div key={r.id} className={styles.row} onClick={r.onTap}>
              <div className={styles.rowText}>
                <div className={[styles.rowName, r.active ? styles.rowNameActive : ''].join(' ')}>{r.name}</div>
                {r.sub && <div className={styles.rowSub}>{r.sub}</div>}
              </div>
              {r.active && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              {r.showChevron && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
