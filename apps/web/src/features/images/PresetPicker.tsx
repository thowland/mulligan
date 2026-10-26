import { presetsInGroup, storeLabel } from '../../core-bridge/images.ts';
import { formatDimensions } from '../format.ts';
import styles from './PresetPicker.module.css';

interface PresetPickerProps {
  groupId: string;
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}

/** Checkboxes for a group's presets, grouped by store, in configuration order. */
export function PresetPicker({ groupId, selected, onChange }: PresetPickerProps) {
  const presets = presetsInGroup(groupId);
  const stores = [...new Set(presets.map((p) => p.store))];

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    // Keep configuration order regardless of click order.
    onChange(presets.filter((p) => next.has(p.id)).map((p) => p.id));
  };

  return (
    <div className={styles.picker}>
      {stores.map((store) => (
        <fieldset key={store} className={styles.store}>
          <legend>{storeLabel(store)}</legend>
          {presets
            .filter((p) => p.store === store)
            .map((preset) => (
              <label key={preset.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={selected.includes(preset.id)}
                  onChange={(event) => toggle(preset.id, event.currentTarget.checked)}
                />
                <span className={styles.name}>{preset.name}</span>
                <span className={styles.dimensions}>
                  {formatDimensions(preset.width, preset.height)}
                </span>
              </label>
            ))}
        </fieldset>
      ))}
    </div>
  );
}
