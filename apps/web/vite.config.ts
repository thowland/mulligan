import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { devHeaders, previewHeaders } from './security/headers.ts';

// Vite's static handler answers a revalidation with a bare 304 that carries none of
// `preview.headers`, and WebKit then blocks the render worker under COEP. Setting the headers
// before any handler runs puts them on every response, 304s included.
const previewHeadersOnEveryResponse = (): Plugin => ({
  name: 'mulligan:preview-headers',
  configurePreviewServer(server) {
    server.middlewares.use((_req, res, next) => {
      for (const [name, value] of Object.entries(previewHeaders)) res.setHeader(name, value);
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), previewHeadersOnEveryResponse()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // Module workers so the render worker can share chunks with the app (spec §9.1).
  worker: { format: 'es' },
  // Dev only: a relaxed CSP for HMR. The preview server (and so the E2E suite) applies the
  // production header set minus the HTTPS-only upgrades, since it serves plain HTTP (spec §10.3).
  server: { headers: devHeaders() },
  preview: { headers: previewHeaders },
});
