import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devHeaders, productionHeaders } from './security/headers.ts';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // Module workers so the render worker can share chunks with the app (spec §9.1).
  worker: { format: 'es' },
  // Dev only: a relaxed CSP for HMR. The preview server (and so the E2E suite) applies the
  // production header set unchanged (spec §10.3).
  server: { headers: devHeaders() },
  preview: { headers: productionHeaders },
});
