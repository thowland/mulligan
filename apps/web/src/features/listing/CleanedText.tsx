import styles from './CleanedText.module.css';

interface CleanedTextProps {
  text: string;
  /** Offset of the first character past the limit, or null. */
  overflowAt: number | null;
}

/**
 * The cleaned copy as plain text, with anything past the limit highlighted. Rendered as text
 * nodes only, never as HTML (spec §10.4).
 */
export function CleanedText({ text, overflowAt }: CleanedTextProps) {
  if (text === '') return <p className={styles.empty}>Nothing to submit yet.</p>;
  const fits = overflowAt === null ? text : text.slice(0, overflowAt);
  const over = overflowAt === null ? '' : text.slice(overflowAt);
  return (
    <div className={styles.text}>
      {fits}
      {over && (
        <mark className={styles.over} title="Past the store limit">
          {over}
        </mark>
      )}
    </div>
  );
}
