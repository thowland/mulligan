// Image state (spec §9.2), kept outside components so it survives switching tabs: sources per
// group in the user's order, preset selection, rejected files and pending replacements. Sources
// and selection are saved to IndexedDB by state/session.ts (spec §9.5).
import { create } from 'zustand';
import type { SourceImage } from '../core-bridge/images.ts';
import {
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
  notices: Notice[];
  pending: PendingReplacement | null;

  addSources(groupId: string, entries: SourceEntry[]): void;
  confirmReplacement(): void;
  cancelReplacement(): void;
  removeSource(groupId: string, id: string): void;
  moveSource(groupId: string, from: number, to: number): void;
  setSelectedPresets(ids: string[]): void;
  addNotices(notices: Notice[]): void;
  dismissNotice(id: string): void;
  reset(): void;
}

const initial = () => ({
  sources: {} as Record<string, SourceEntry[]>,
  selectedPresetIds: defaultSelectionAll(),
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
