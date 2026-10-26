import { presetGroups } from '../../core-bridge/standards.ts';
import { formatAnchor, formatBytes, formatDimensions, formatOutput } from '../format.ts';
import styles from './PresetCatalog.module.css';

/** Read-only overview of the output presets defined in the standards. */
export function PresetCatalog() {
  return (
    <div className={styles.catalog}>
      <p className={styles.intro}>
        Output sizes defined by the current standards. Uploading and resizing arrive in the next
        sprint.
      </p>
      {presetGroups().map(({ group, stores }) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`} className={styles.group}>
          <header className={styles.groupHeader}>
            <h2 id={`group-${group.id}`}>{group.label}</h2>
            <span className={styles.meta}>
              {formatAnchor(group.anchor)} · up to {group.maxFiles}{' '}
              {group.maxFiles === 1 ? 'file' : 'files'}
            </span>
          </header>
          {stores.map(({ store, presets }) => (
            <div key={store.id} className={styles.store}>
              <h3>{store.label}</h3>
              <ul className={styles.presets}>
                {presets.map((preset) => (
                  <li key={preset.id} className={styles.preset}>
                    <div className={styles.presetTitle}>
                      <span className={styles.presetName}>{preset.name}</span>
                      {preset.defaultSelected && (
                        <span className={styles.badge}>Selected by default</span>
                      )}
                    </div>
                    <div className={styles.dimensions}>
                      {formatDimensions(preset.width, preset.height)}
                    </div>
                    <dl className={styles.details}>
                      <div>
                        <dt>Output</dt>
                        <dd>{formatOutput(preset)}</dd>
                      </div>
                      <div>
                        <dt>Folder</dt>
                        <dd>
                          <code>{preset.folder}/</code>
                        </dd>
                      </div>
                      {preset.maxBytes !== undefined && (
                        <div>
                          <dt>Max size</dt>
                          <dd>{formatBytes(preset.maxBytes)}</dd>
                        </div>
                      )}
                    </dl>
                    {preset.note && <p className={styles.note}>{preset.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
