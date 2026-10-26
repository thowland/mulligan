import { useMemo } from 'react';
import { cleanListing, fieldLabel } from '../../core-bridge/listing.ts';
import { fieldsByStore } from '../../core-bridge/standards.ts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.ts';
import { useListingStore } from '../../state/listing.ts';
import { FieldEditor } from './FieldEditor.tsx';
import { ListingImport } from './ListingImport.tsx';
import styles from './ListingPanel.module.css';

/** Milliseconds to wait after typing before the copy is re-cleaned (spec §9.4). */
export const LISTING_DEBOUNCE_MS = 150;

/** The listing form: one editor per field, grouped by store (spec §9.3). */
export function ListingPanel({ debounceMs = LISTING_DEBOUNCE_MS }: { debounceMs?: number }) {
  const inputs = useListingStore((s) => s.inputs);
  const straightQuotes = useListingStore((s) => s.straightQuotes);
  const setInput = useListingStore((s) => s.setInput);
  const setStraightQuotes = useListingStore((s) => s.setStraightQuotes);
  const reverted = useListingStore((s) => s.reverted);
  const clearedReverts = useListingStore((s) => s.clearedReverts);
  const toggleRevert = useListingStore((s) => s.toggleRevert);
  const dismissCleared = useListingStore((s) => s.dismissClearedReverts);

  const draft = useMemo(
    () => ({ inputs, straightQuotes, reverted }),
    [inputs, straightQuotes, reverted],
  );
  const settled = useDebouncedValue(draft, debounceMs);
  const results = useMemo(() => cleanListing(settled), [settled]);

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Paste each field from Word, Google Docs or a web page. Mulligan fixes characters and
        whitespace only and never changes wording; copy the cleaned text into App Store Connect or
        the Play Console.
      </p>
      <ListingImport />
      {fieldsByStore().map(({ store, fields }) => (
        <section key={store.id} aria-labelledby={`listing-${store.id}`} className={styles.store}>
          <h2 id={`listing-${store.id}`} className={styles.heading}>
            {store.label}
          </h2>
          {fields.map((field) => (
            <FieldEditor
              key={field.id}
              field={field}
              input={inputs[field.id] ?? { text: '' }}
              straightQuotes={straightQuotes[field.id] ?? false}
              result={results[field.id]!}
              onInput={(input) => setInput(field.id, input)}
              onStraightQuotes={(value) => setStraightQuotes(field.id, value)}
              onToggleRevert={(changeId) => toggleRevert(field.id, changeId)}
              reverted={reverted[field.id]}
              clearedReverts={clearedReverts[field.id]}
              onDismissCleared={() => dismissCleared(field.id)}
              copySource={
                field.copyFrom === undefined
                  ? undefined
                  : {
                      label: fieldLabel(field.copyFrom),
                      input: inputs[field.copyFrom] ?? { text: '' },
                    }
              }
            />
          ))}
        </section>
      ))}
    </div>
  );
}
