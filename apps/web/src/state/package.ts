// Package settings (spec §8.1), kept outside components so they survive switching tabs and saved
// with the session by state/session.ts.
import { create } from 'zustand';

export interface PackageState {
  /** The app's name as the user typed it; core turns it into the ZIP's file name. */
  appName: string;
  setAppName(appName: string): void;
  reset(): void;
}

export const usePackageStore = create<PackageState>()((set) => ({
  appName: '',
  setAppName: (appName) => set({ appName }),
  reset: () => set({ appName: '' }),
}));
