import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { sharedRenderCache } from './render/cache.ts';
import { installDropGuard } from './security/dropGuard.ts';
import { installTrustedTypesPolicy, type TrustedTypesLike } from './security/trustedTypes.ts';
import { startSession } from './state/session.ts';
import './styles/tokens.css';
import './styles/global.css';

// Before anything can create a worker or receive a drop (spec §10.2, §10.3).
installTrustedTypesPolicy(
  (window as { trustedTypes?: TrustedTypesLike }).trustedTypes,
  window.location.origin,
);
installDropGuard(window);

// Restore the saved session and keep it saved (spec §9.5). Clearing also drops cached renders.
startSession({ onClear: () => sharedRenderCache().prune(new Set()) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
