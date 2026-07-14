import styles from './FloorplanSkeleton.module.css';

/** Faint room-like placeholder blocks, as fractions of the sheet. */
const BLOCKS = [
  { left: '5%', top: '8%', width: '18%', height: '26%' },
  { left: '29%', top: '8%', width: '14%', height: '26%' },
  { left: '62%', top: '10%', width: '17%', height: '20%' },
  { left: '6%', top: '58%', width: '26%', height: '32%' },
  { left: '44%', top: '52%', width: '16%', height: '22%' },
  { left: '70%', top: '62%', width: '24%', height: '28%' },
];

/**
 * Shimmer skeleton shown while a floor's real plan image is being fetched/rendered — replaces
 * the old placeholder-schematic approach, which drew a fake floorplan (with live markers on it)
 * that read as real-but-wrong data during the load window.
 */
export function FloorplanSkeleton() {
  return (
    <div className={styles.wrap}>
      <div className={styles.sheet}>
        {BLOCKS.map((b, i) => (
          <div key={i} className={styles.block} style={b} />
        ))}
        <div className={styles.shimmer} />
      </div>
      <div className={styles.label}>
        <div className={styles.spinner} />
        Loading floorplan…
      </div>
    </div>
  );
}
