import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useImageStore } from '../src/state/images.ts';
import { useListingStore } from '../src/state/listing.ts';
import { useOutcomeStore } from '../src/state/outcomes.ts';

// Stores are module singletons; every test starts from an empty workspace.
afterEach(() => {
  cleanup();
  useImageStore.getState().reset();
  useListingStore.getState().reset();
  useOutcomeStore.getState().reset();
});

// jsdom implements neither blob: URLs nor image decoding; tests only need stable URLs.
if (!('createObjectURL' in URL)) {
  let next = 0;
  Object.assign(URL, {
    createObjectURL: () => `blob:test/${(next += 1)}`,
    revokeObjectURL: () => undefined,
  });
}
