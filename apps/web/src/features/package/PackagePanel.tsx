import styles from './PackagePanel.module.css';

/** Placeholder until packaging arrives in Sprint 2. */
export function PackagePanel() {
  return (
    <div className={styles.empty}>
      <h2>Nothing to package yet</h2>
      <p>
        Once images and listing copy are added, this tab will summarize every output and finding and
        produce a single ZIP for upload to the stores.
      </p>
    </div>
  );
}
