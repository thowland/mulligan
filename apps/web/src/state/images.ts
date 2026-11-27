// Image state (spec §9.2), kept outside components so it survives switching tabs: sources per
// group in the user's order, preset selection, the optional groups left out of the output,
// rejected files and pending replacements. Sources, selection and excluded groups are saved to
// IndexedDB by state/session.ts (spec §9.5).
import { useMemo } from 'react';
import { create } from 'zustand';
import type { SourceImage } from '../core-bridge/images.ts';
import {
  allGroups,
  defaultSelection,
  defaultSelectionAll,
  groupById,
  inConfigOrder,
  presetsInGroup,
} from '../core-bridge/images.ts';

export interface SourceEntry extends SourceImage {
  /** Hex SHA-256 of the file bytes; keys the render cache and is recorded in the manifest. */
  sha256: string;
}

export interface Notice {
  id: string;
  groupId: string;
  fileName: string;
  messages: string[];
}

export interface PendingReplacement {
  groupId: string;
  incoming: SourceEntry;
}

export interface ImagesState {
  sources: Record<string, SourceEntry[]>;
  selectedPresetIds: string[];
  /** Optional groups switched off: their files and ticks are kept but produce no output. */
  disabledGroupIds: string[];
  notices: Notice[];
  pending: PendingReplacement | null;

  addSources(groupId: string, entries: SourceEntry[]): void;
  confirmReplacement(): void;
  cancelReplacement(): void;
  removeSource(groupId: string, id: string): void;
  moveSource(groupId: string, from: number, to: number): void;
  setSelectedPresets(ids: string[]): void;
  setGroupEnabled(groupId: string, enabled: boolean): void;
  addNotices(notices: Notice[]): void;
  dismissNotice(id: string): void;
  reset(): void;
}

/** Optional groups start switched off. */
export function optionalGroupIds(): string[] {
  return allGroups()
    .filter((g) => g.optional)
    .map((g) => g.id);
}

export interface ActiveImages {
  sources: Record<string, SourceEntry[]>;
  presetIds: string[];
}

/**
 * What counts towards previews, checks and the package: everything except the sources and presets
 * of the groups that are switched off.
 */
export function activeImages(
  state: Pick<ImagesState, 'sources' | 'selectedPresetIds' | 'disabledGroupIds'>,
): ActiveImages {
  const { sources, selectedPresetIds, disabledGroupIds } = state;
  if (disabledGroupIds.length === 0) return { sources, presetIds: selectedPresetIds };
  const off = new Set(disabledGroupIds);
  const excluded = new Set(
    disabledGroupIds.flatMap((groupId) => presetsInGroup(groupId).map((p) => p.id)),
  );
  return {
    sources: Object.fromEntries(Object.entries(sources).filter(([groupId]) => !off.has(groupId))),
    presetIds: selectedPresetIds.filter((id) => !excluded.has(id)),
  };
}

/** `activeImages` for components, stable until the store values behind it change. */
export function useActiveImages(): ActiveImages {
  const sources = useImageStore((s) => s.sources);
  const selectedPresetIds = useImageStore((s) => s.selectedPresetIds);
  const disabledGroupIds = useImageStore((s) => s.disabledGroupIds);
  return useMemo(
    () => activeImages({ sources, selectedPresetIds, disabledGroupIds }),
    [sources, selectedPresetIds, disabledGroupIds],
  );
}

const initial = () => ({
  sources: {} as Record<string, SourceEntry[]>,
  selectedPresetIds: defaultSelectionAll(),
  disabledGroupIds: optionalGroupIds(),
  notices: [] as Notice[],
  pending: null as PendingReplacement | null,
});

/**
 * Files dropped into a group with none of its presets selected would be left out of the package,
 * so the group's default presets (or, with none, all of them) are selected for it.
 */
function selectGroupIfNone(selected: string[], groupId: string): string[] {
  const group = presetsInGroup(groupId).map((p) => p.id);
  if (group.some((id) => selected.includes(id))) return selected;
  const defaults = defaultSelection(groupId);
  return inConfigOrder([...selected, ...(defaults.length > 0 ? defaults : group)]);
}

let noticeCounter = 0;
export const noticeId = () => `notice-${(noticeCounter += 1)}`;

export const useImageStore = create<ImagesState>()((set) => ({
  ...initial(),

  addSources(groupId, entries) {
    if (entries.length === 0) return;
    set((state) => {
      const { maxFiles } = groupById(groupId);
      const current = state.sources[groupId] ?? [];
      // A full single-file zone asks before replacing its file.
      if (maxFiles === 1 && current.length === 1) {
        return { pending: { groupId, incoming: entries[0]! } };
      }
      const room = Math.max(0, maxFiles - current.length);
      const accepted = entries.slice(0, room);
      const overflow = entries.slice(room).map((entry) => ({
        id: noticeId(),
        groupId,
        fileName: entry.fileName,
        messages: [
          `Only ${maxFiles} ${maxFiles === 1 ? 'file is' : 'files are'} allowed here; this one was not added.`,
        ],
      }));
      return {
        sources: { ...state.sources, [groupId]: [...current, ...accepted] },
        notices: [...state.notices, ...overflow],
        // Dropping files into a group that is switched off asks for it to be included.
        ...(accepted.length > 0 && state.disabledGroupIds.includes(groupId)
          ? { disabledGroupIds: state.disabledGroupIds.filter((id) => id !== groupId) }
          : {}),
        // Only a group's first files: a later deselection is the user's choice.
        ...(current.length === 0 && accepted.length > 0
          ? { selectedPresetIds: selectGroupIfNone(state.selectedPresetIds, groupId) }
          : {}),
      };
    });
  },

  confirmReplacement() {
    set((state) =>
      state.pending
        ? {
            sources: { ...state.sources, [state.pending.groupId]: [state.pending.incoming] },
            pending: null,
          }
        : {},
    );
  },

  cancelReplacement() {
    set({ pending: null });
  },

  removeSource(groupId, id) {
    set((state) => ({
      sources: {
        ...state.sources,
        [groupId]: (state.sources[groupId] ?? []).filter((s) => s.id !== id),
      },
    }));
  },

  moveSource(groupId, from, to) {
    set((state) => {
      const list = [...(state.sources[groupId] ?? [])];
      if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return {};
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved!);
      return { sources: { ...state.sources, [groupId]: list } };
    });
  },

  setSelectedPresets(ids) {
    set({ selectedPresetIds: ids });
  },

  setGroupEnabled(groupId, enabled) {
    set((state) => {
      if (!groupById(groupId).optional) return {};
      const others = state.disabledGroupIds.filter((id) => id !== groupId);
      if (!enabled) return { disabledGroupIds: [...others, groupId] };
      return {
        disabledGroupIds: others,
        selectedPresetIds: selectGroupIfNone(state.selectedPresetIds, groupId),
      };
    });
  },

  addNotices(notices) {
    if (notices.length > 0) set((state) => ({ notices: [...state.notices, ...notices] }));
  },

  dismissNotice(id) {
    set((state) => ({ notices: state.notices.filter((n) => n.id !== id) }));
  },

  reset() {
    set(initial());
  },
}));
