import { useRef } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { NavRail } from './NavRail';
import { MapStage } from './MapStage';
import { SettingsScreen } from '../settings/SettingsScreen';
import { MobileApp } from '../mobile/MobileApp';
import { Toast } from '../primitives/Toast';
import styles from './AppShell.module.css';

export function AppShell() {
  const { state, actions } = useFloorplan();
  const isMobileViewport = useMediaQuery('(max-width: 720px)');
  const stageRef = useRef<HTMLDivElement>(null);

  if (state.loading && state.portfolio.length === 0) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (isMobileViewport) {
    return (
      <div className={styles.mobileRoot}>
        <MobileApp mode="page" />
        <Toast message={state.toast} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <NavRail />
      {state.activeView === 'settings' ? <SettingsScreen /> : <MapStage stageRef={stageRef} />}
      {state.mobileOpen && <MobileApp mode="fullscreen" onClose={actions.toggleMobile} />}
      <Toast message={state.toast} />
    </div>
  );
}
