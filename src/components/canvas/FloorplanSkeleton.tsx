import styles from './FloorplanSkeleton.module.css';

/**
 * Loader per the "Floorplan Loader" design: a blueprint-style plan sketch in
 * a white card that draws itself in (walls → doors → furniture), then softly
 * fades and loops, over an indeterminate progress bar and a label. All paths
 * use pathLength=1 so the stroke-draw keyframes share the same dash math.
 */
export function FloorplanSkeleton() {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <svg className={styles.plan} viewBox="0 0 360 260" fill="none" aria-hidden>
          {/* outer + inner walls */}
          <g className={styles.walls} strokeLinecap="round">
            <rect x="22" y="20" width="316" height="206" rx="4" strokeWidth="7" pathLength="1" />
            {/* top-half dividers with door gaps */}
            <path d="M148 20v58 m0 26v22" strokeWidth="3" pathLength="1" />
            <path d="M236 20v34 m0 26v46" strokeWidth="3" pathLength="1" />
            {/* horizontal divider with two door gaps */}
            <path d="M22 126h64 m24 0h96 m26 0h58 m24 0h24" strokeWidth="3" pathLength="1" />
            {/* bottom-half dividers */}
            <path d="M134 126v38 m0 26v36" strokeWidth="3" pathLength="1" />
            <path d="M228 126v20 m0 26v54" strokeWidth="3" pathLength="1" />
            {/* window notches on the outer wall */}
            <path d="M70 20h34 M196 20h30 M22 84v28 M338 96v30 M120 226h36 M252 226h34" strokeWidth="3" className={styles.window} pathLength="1" />
          </g>

          {/* door swings */}
          <g className={styles.doors} strokeWidth="2">
            <path d="M148 78a26 26 0 0 1 26 26" pathLength="1" />
            <path d="M236 54a26 26 0 0 1 26 26" pathLength="1" />
            <path d="M86 126a24 24 0 0 1 24 -24" pathLength="1" />
            <path d="M206 126a26 26 0 0 1 26 -26" pathLength="1" />
            <path d="M134 164a26 26 0 0 1 26 26" pathLength="1" />
            <path d="M228 146a20 20 0 0 1 20 20" pathLength="1" />
          </g>

          {/* furniture, room by room */}
          <g className={styles.furniture} strokeWidth="2.5" strokeLinejoin="round">
            {/* living room (top-left): sofa + rug + side table */}
            <rect x="40" y="40" width="52" height="20" rx="4" />
            <path d="M46 40v-6h40v6" />
            <circle cx="66" cy="92" r="14" />
            <rect x="112" y="38" width="22" height="14" rx="2" />
            {/* bathroom (top-middle): tub + sink */}
            <rect x="162" y="36" width="20" height="42" rx="8" />
            <circle cx="212" cy="46" r="8" />
            <rect x="202" y="66" width="22" height="14" rx="3" />
            {/* bedroom (top-right): bed + pillows + wardrobe */}
            <rect x="254" y="36" width="52" height="40" rx="3" />
            <rect x="258" y="40" width="18" height="12" rx="2" />
            <rect x="280" y="40" width="18" height="12" rx="2" />
            <rect x="312" y="90" width="16" height="30" rx="2" />
            {/* bedroom 2 (bottom-left): bed */}
            <rect x="42" y="146" width="46" height="56" rx="3" />
            <rect x="46" y="150" width="16" height="12" rx="2" />
            {/* dining (bottom-middle): table + chairs */}
            <rect x="158" y="158" width="46" height="30" rx="3" />
            <rect x="166" y="146" width="12" height="8" rx="2" />
            <rect x="186" y="146" width="12" height="8" rx="2" />
            <rect x="166" y="192" width="12" height="8" rx="2" />
            <rect x="186" y="192" width="12" height="8" rx="2" />
            {/* study (bottom-right): desk + chair */}
            <rect x="248" y="180" width="56" height="16" rx="2" />
            <circle cx="276" cy="164" r="8" />
          </g>
        </svg>
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressBar} />
      </div>

      <div className={styles.label}>
        <span>Loading floor plan</span>
        <span className={styles.ellipsis}>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
