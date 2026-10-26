import type { FieldCount } from '@mulligan/core';
import styles from './CountMeter.module.css';

const unitWord = (unit: FieldCount['unit']) => (unit === 'bytes' ? 'bytes' : 'characters');

/** Live count against the field limit (spec §9.3). */
export function CountMeter({ count, label }: { count: FieldCount; label: string }) {
  const over = count.value - count.limit;
  const fraction = Math.min(1, count.limit === 0 ? 0 : count.value / count.limit);
  const text =
    over > 0
      ? `${count.value} / ${count.limit} ${unitWord(count.unit)}, ${over} over`
      : `${count.value} / ${count.limit} ${unitWord(count.unit)}`;
  return (
    <div className={styles.meter} data-over={over > 0}>
      <div
        role="meter"
        aria-label={`${label} length`}
        aria-valuemin={0}
        aria-valuemax={count.limit}
        aria-valuenow={Math.min(count.value, count.limit)}
        aria-valuetext={text}
        className={styles.track}
      >
        <div className={styles.fill} style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className={styles.text}>{text}</span>
    </div>
  );
}
