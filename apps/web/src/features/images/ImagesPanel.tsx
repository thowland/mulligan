import { useEffect } from 'react';
import { allGroups, presetsInGroup } from '../../core-bridge/images.ts';
import { renderKey, useRenderCache } from '../../render/cache.ts';
import { useSession } from '../../state/session.ts';
import { GroupSection } from './GroupSection.tsx';
import styles from './ImagesPanel.module.css';

/** The Images tab: one section per asset group from the standards. */
export function ImagesPanel() {
  const cache = useRenderCache();
  const sources = useSession((s) => s.sources);
  const selected = useSession((s) => s.selectedPresetIds);

  // Cancel and forget renders for removed sources and deselected presets (spec §9.4). Reordering
  // changes neither, so it never re-renders.
  useEffect(() => {
    const active = new Set<string>();
    for (const [groupId, list] of Object.entries(sources)) {
      const presets = presetsInGroup(groupId).filter((p) => selected.includes(p.id));
      for (const source of list) for (const p of presets) active.add(renderKey(source, p.id));
    }
    cache.prune(active);
  }, [cache, sources, selected]);

  return (
    <div className={styles.panel}>
      {allGroups().map((group) => (
        <GroupSection key={group.id} group={group} />
      ))}
    </div>
  );
}
