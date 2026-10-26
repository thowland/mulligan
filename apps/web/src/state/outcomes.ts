// Render outcomes reported by preview cards: the findings of each verified full render (output
// size, alpha, dimensions) or its failure, keyed by renderKey. Read by the workspace status so
// render-time failures count even while the Images tab is not shown.
import type { Finding } from '@mulligan/core';
import { create } from 'zustand';

export interface OutcomeState {
  byKey: Record<string, Finding[]>;
  report: (key: string, findings: Finding[]) => void;
  reset: () => void;
}

export const useOutcomeStore = create<OutcomeState>()((set) => ({
  byKey: {},
  report: (key, findings) => set((s) => ({ byKey: { ...s.byKey, [key]: findings } })),
  reset: () => set({ byKey: {} }),
}));
