import type { RefObject } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { floorMeta } from '../../state/selectors';
import { Canvas } from '../canvas/Canvas';
import { EmptyPlanState } from '../canvas/EmptyPlanState';
import { FloorUploadModal } from '../canvas/FloorUploadModal';
import { LocationPanel } from '../location/LocationPanel';
import { DetailsPanel } from '../details/DetailsPanel';
import { Toolbar } from './Toolbar';
import { Button } from '../primitives/Button';
import styles from './MapStage.module.css';

export function MapStage({ stageRef }: { stageRef: RefObject<HTMLDivElement> }) {
  const { state, actions } = useFloorplan();
  const floor = floorMeta(state, state.floorId)?.floor;
  // Whichever data tier actually answered may not agree with the portfolio tier on this floor's
  // id (e.g. the real @facilio/api portfolio doesn't know the mock demo floor id, or vice versa)
  // — so render the canvas whenever there's actually something to show, not just when the
  // portfolio tree's own hasPlan flag happens to line up.
  const hasContent = state.units.length > 0 || !!state.floorImages[state.floorId];
  const hasPlan = hasContent || !!floor?.hasPlan;

  const leftPad = state.panels.portfolio.open ? 320 : 76;
  const rightPad = state.panels.details.open ? 336 : 76;

  const layoutMoved = (['portfolio', 'details'] as const).some((id) => state.panels[id].x != null || !state.panels[id].open);

  return (
    <div ref={stageRef} className={styles.stage}>
      <LocationPanel />

      <Toolbar leftPad={leftPad} rightPad={rightPad} />

      {!hasPlan && <EmptyPlanState />}
      {hasPlan && <Canvas />}

      <DetailsPanel />

      {layoutMoved && (
        <div className={styles.resetLayout}>
          <Button variant="secondary" onClick={actions.resetLayout}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset layout
          </Button>
        </div>
      )}

      <FloorUploadModal />
    </div>
  );
}
