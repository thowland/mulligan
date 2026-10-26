// Listing input state. Kept outside components so it survives switching tabs; persistence to
// IndexedDB arrives in Sprint 5.
import type { RawFieldInput } from '@mulligan/core';
import { create } from 'zustand';
import { straightQuoteDefaults } from '../core-bridge/listing.ts';

export interface ListingState {
  inputs: Record<string, RawFieldInput>;
  straightQuotes: Record<string, boolean>;
  setInput: (fieldId: string, input: RawFieldInput) => void;
  setStraightQuotes: (fieldId: string, value: boolean) => void;
  reset: () => void;
}

const initial = () => ({ inputs: {}, straightQuotes: straightQuoteDefaults() });

export const useListingStore = create<ListingState>()((set) => ({
  ...initial(),
  setInput: (fieldId, input) => set((s) => ({ inputs: { ...s.inputs, [fieldId]: input } })),
  setStraightQuotes: (fieldId, value) =>
    set((s) => ({ straightQuotes: { ...s.straightQuotes, [fieldId]: value } })),
  reset: () => set(initial()),
}));
