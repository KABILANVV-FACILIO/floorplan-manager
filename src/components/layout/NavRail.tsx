import type { ReactNode } from 'react';
import { useFloorplan } from '../../state/FloorplanContext';
import type { Role } from '../../lib/types';
import styles from './NavRail.module.css';

const ROLE_CHIPS: { id: Role; name: string }[] = [
  { id: 'admin', name: 'Admin' },
  { id: 'manager', name: 'Manager' },
  { id: 'employee', name: 'Employee' },
];

export function NavRail() {
  const { state, actions } = useFloorplan();
  const bookingCount = state.bookings.length;

  return (
    <div className={styles.rail} style={{ width: state.navOpen ? 236 : 68 }}>
      <div className={styles.header}>
        <span className={styles.logo}>
          facilio<span className={styles.dot} /><span className={styles.sq} />
        </span>
        {state.navOpen && <span className={styles.logoSub}>Atom</span>}
        <button className={styles.toggle} title="Toggle menu" onClick={actions.toggleNav}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      </div>

      <div className={styles.items}>
        <NavItem
          active={state.activeView === 'map'}
          open={state.navOpen}
          label="Floorplans"
          onClick={actions.openMap}
          icon={<path d="M9 3L4 5v16l5-2 6 2 5-2V3l-5 2-6-2z M9 3v16M15 5v16" />}
        />
        <NavItem
          open={state.navOpen}
          label="Bookings"
          badge={bookingCount}
          icon={<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>}
        />
        <NavItem
          open={state.navOpen}
          label="People"
          icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>}
        />
        <div style={{ flex: 1 }} />
        <NavItem
          active={state.activeView === 'settings'}
          open={state.navOpen}
          label="Settings"
          onClick={actions.openSettings}
          icon={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>}
        />
      </div>

      {state.navOpen && (
        <div className={styles.footer}>
          <div className={styles.footerLabel}>Viewing as</div>
          <div className={styles.roleChips}>
            {ROLE_CHIPS.map((rc) => (
              <button
                key={rc.id}
                className={[styles.roleChip, state.role === rc.id ? styles.roleChipActive : ''].join(' ')}
                onClick={() => actions.setRole(rc.id)}
              >
                {rc.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  open,
  label,
  icon,
  badge,
  onClick,
}: {
  active?: boolean;
  open: boolean;
  label: string;
  icon: ReactNode;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <div className={[styles.navItem, active ? styles.navItemActive : ''].join(' ')} title={label} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={styles.navIcon}>
        {icon}
      </svg>
      {open && (
        <>
          <span className={styles.navLabel}>{label}</span>
          {badge != null && <span className={styles.navBadge}>{badge}</span>}
        </>
      )}
    </div>
  );
}
