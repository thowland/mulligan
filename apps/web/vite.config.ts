import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // Module workers so the render worker can share chunks with the app (spec §9.1).
  worker: { format: 'es' },
});
