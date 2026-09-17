import styles from './ProgressBar.module.css'

interface ProgressBarProps {
  pct: number
  color: string
}

/** Barra de progreso lineal — extraída del patrón .barTrack/.barFill que antes
 * vivía duplicado inline en CategoriesCard y MonthHero. */
export function ProgressBar({ pct, color }: ProgressBarProps) {
  return (
    <div className={styles.track}>
      <div className={styles.fill} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
    </div>
  )
}

interface SegmentedProgressBarProps {
  segments: number
  filled: number
  color: string
}

/** Barra segmentada (ej. 7 días lunes-domingo) — usada por el Cupo Semanal Vivo. */
export function SegmentedProgressBar({ segments, filled, color }: SegmentedProgressBarProps) {
  return (
    <div className={styles.segmentedTrack}>
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={styles.segment} style={i < filled ? { background: color } : undefined} />
      ))}
    </div>
  )
}
