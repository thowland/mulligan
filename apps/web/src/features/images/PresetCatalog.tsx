import { presetGroups } from '../../core-bridge/standards.ts';
import { formatAnchor, formatBytes, formatDimensions, formatOutput } from '../format.ts';
import styles from './PresetCatalog.module.css';

interface PresetCatalogProps {
  /** Groups shown elsewhere (for example screenshots, which have their own workbench). */
  excludeGroups?: readonly string[];
}

/** Read-only overview of the output presets defined in the standards. */
export function PresetCatalog({ excludeGroups = [] }: PresetCatalogProps) {
  return (
    <div className={styles.catalog}>
      {presetGroups()
        .filter(({ group }) => !excludeGroups.includes(group.id))
        .map(({ group, stores }) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className={styles.group}>
            <header className={styles.groupHeader}>
              <h3 id={`group-${group.id}`}>{group.label}</h3>
              <span className={styles.meta}>
                {formatAnchor(group.anchor)} · up to {group.maxFiles}{' '}
                {group.maxFiles === 1 ? 'file' : 'files'}
              </span>
            </header>
            {stores.map(({ store, presets }) => (
              <div key={store.id} className={styles.store}>
                <h4>{store.label}</h4>
                <ul className={styles.presets}>
                  {presets.map((preset) => (
                    // Every card has the same five rows so that a subgrid aligns them across
                    // cards, whether or not the badge or note is present.
                    <li key={preset.id} className={styles.preset}>
                      <span className={styles.presetName}>{preset.name}</span>
                      <span>
                        {preset.defaultSelected && (
                          <span className={styles.badge}>Selected by default</span>
                        )}
                      </span>
                      <span className={styles.dimensions}>
                        {formatDimensions(preset.width, preset.height)}
                      </span>
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
                      <p className={styles.note}>{preset.note ?? ''}</p>
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
