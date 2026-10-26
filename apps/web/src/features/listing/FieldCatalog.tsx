import { fieldsByStore } from '../../core-bridge/standards.ts';
import { formatLimit } from '../format.ts';
import styles from './FieldCatalog.module.css';

/** Read-only overview of the listing fields defined in the standards. */
export function FieldCatalog() {
  return (
    <div className={styles.catalog}>
      <p className={styles.intro}>
        Listing fields and limits defined by the current standards. Pasting and cleaning copy arrive
        in a later sprint.
      </p>
      {fieldsByStore().map(({ store, fields }) => (
        <section key={store.id} aria-labelledby={`store-${store.id}`}>
          <h2 id={`store-${store.id}`} className={styles.heading}>
            {store.label}
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Limit</th>
                  <th scope="col">Lines</th>
                  <th scope="col">Required</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id}>
                    <th scope="row">{field.label}</th>
                    <td className={styles.number}>{formatLimit(field.limit)}</td>
                    <td>{field.multiline ? 'Multi-line' : 'Single line'}</td>
                    <td>{field.required ? 'Required' : 'Optional'}</td>
                    <td className={styles.muted}>{field.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
