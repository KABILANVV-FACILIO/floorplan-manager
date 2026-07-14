import styles from './FloorplanSkeleton.module.css';

/**
 * Room-like placeholder blocks (fractions of the sheet), each with a small
 * desk-dot grid so the skeleton reads as "a floorplan is coming". Staggered
 * per-block shimmer sweeps + a breathing base keep it visibly alive.
 */
const BLOCKS: { left: string; top: string; width: string; height: string; dots: number; delay: string }[] = [
  { left: '5%', top: '8%', width: '18%', height: '26%', dots: 6, delay: '0s' },
  { left: '29%', top: '8%', width: '14%', height: '26%', dots: 4, delay: '0.15s' },
  { left: '62%', top: '10%', width: '17%', height: '20%', dots: 6, delay: '0.3s' },
  { left: '84%', top: '10%', width: '11%', height: '32%', dots: 2, delay: '0.45s' },
  { left: '6%', top: '58%', width: '26%', height: '32%', dots: 8, delay: '0.2s' },
  { left: '44%', top: '52%', width: '16%', height: '22%', dots: 4, delay: '0.35s' },
  { left: '70%', top: '62%', width: '24%', height: '28%', dots: 6, delay: '0.5s' },
];

/** Corridor-ish connector lines between the block clusters. */
const LINES: { left: string; top: string; width: string; delay: string }[] = [
  { left: '8%', top: '44%', width: '36%', delay: '0.1s' },
  { left: '52%', top: '40%', width: '30%', delay: '0.4s' },
  { left: '40%', top: '84%', width: '22%', delay: '0.25s' },
];

export function FloorplanSkeleton() {
  return (
    <div className={styles.wrap}>
      <div className={styles.sheet}>
        {BLOCKS.map((b, i) => (
          <div
            key={i}
            className={styles.block}
            style={{
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
              animationDelay: b.delay,
              ['--sweep-delay' as string]: b.delay,
            }}
          >
            <span className={styles.blockTitle} />
            <span className={styles.dots}>
              {Array.from({ length: b.dots }, (_, j) => (
                <span key={j} className={styles.dot} style={{ animationDelay: `${(i * 0.12 + j * 0.07).toFixed(2)}s` }} />
              ))}
            </span>
          </div>
        ))}
        {LINES.map((l, i) => (
          <div key={i} className={styles.line} style={{ left: l.left, top: l.top, width: l.width, animationDelay: l.delay }} />
        ))}
        <div className={styles.shimmer} />
      </div>
      <div className={styles.label}>
        <div className={styles.spinner} />
        <span>Loading floorplan</span>
        <span className={styles.ellipsis}>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}
