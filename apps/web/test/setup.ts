import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom implements neither blob: URLs nor image decoding; tests only need stable URLs.
if (!('createObjectURL' in URL)) {
  let next = 0;
  Object.assign(URL, {
    createObjectURL: () => `blob:test/${(next += 1)}`,
    revokeObjectURL: () => undefined,
  });
}
