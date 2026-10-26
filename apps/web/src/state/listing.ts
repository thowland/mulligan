// Listing input state. Kept outside components so it survives switching tabs; saved to
// IndexedDB by state/session.ts (spec §9.5).
import type { ChangeId, RawFieldInput } from '@mulligan/core';
import { create } from 'zustand';
import { straightQuoteDefaults } from '../core-bridge/listing.ts';

export interface ListingState {
  inputs: Record<string, RawFieldInput>;
  straightQuotes: Record<string, boolean>;
  /** Reverted changes per field (spec §6.3); ids are stable for a given source. */
  reverted: Record<string, ChangeId[]>;
  /** Fields whose reverts were cleared by a source edit, with how many were cleared. */
  clearedReverts: Record<string, number>;
  setInput: (fieldId: string, input: RawFieldInput) => void;
  setStraightQuotes: (fieldId: string, value: boolean) => void;
  /** Reverts a change, or restores it when it is already reverted. */
  toggleRevert: (fieldId: string, changeId: ChangeId) => void;
  /** Replaces the source of each imported field; its reverts no longer apply. */
  importFields: (fields: Readonly<Record<string, RawFieldInput>>) => void;
  dismissClearedReverts: (fieldId: string) => void;
  reset: () => void;
}

const initial = () => ({
  inputs: {},
  straightQuotes: straightQuoteDefaults(),
  reverted: {},
  clearedReverts: {},
});

function without<T>(record: Record<string, T>, ...keys: string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

export const useListingStore = create<ListingState>()((set) => ({
  ...initial(),
  setInput: (fieldId, input) =>
    set((s) => {
      // Change ids are expressed in baseline coordinates, so editing the source invalidates them.
      const cleared = s.reverted[fieldId]?.length ?? 0;
      return {
        inputs: { ...s.inputs, [fieldId]: input },
        reverted: without(s.reverted, fieldId),
        clearedReverts:
          cleared > 0 ? { ...s.clearedReverts, [fieldId]: cleared } : s.clearedReverts,
      };
    }),
  setStraightQuotes: (fieldId, value) =>
    set((s) => ({ straightQuotes: { ...s.straightQuotes, [fieldId]: value } })),
  toggleRevert: (fieldId, changeId) =>
    set((s) => {
      const current = s.reverted[fieldId] ?? [];
      const next = current.includes(changeId)
        ? current.filter((id) => id !== changeId)
        : [...current, changeId];
      return {
        reverted: { ...s.reverted, [fieldId]: next },
        clearedReverts: without(s.clearedReverts, fieldId),
      };
    }),
  importFields: (fields) =>
    set((s) => {
      const ids = Object.keys(fields);
      return {
        inputs: { ...s.inputs, ...fields },
        reverted: without(s.reverted, ...ids),
        clearedReverts: without(s.clearedReverts, ...ids),
      };
    }),
  dismissClearedReverts: (fieldId) =>
    set((s) => ({ clearedReverts: without(s.clearedReverts, fieldId) })),
  reset: () => set(initial()),
}));
