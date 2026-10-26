import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { installDropGuard } from './security/dropGuard.ts';
import { installTrustedTypesPolicy, type TrustedTypesLike } from './security/trustedTypes.ts';
import './styles/tokens.css';
import './styles/global.css';

// Before anything can create a worker or receive a drop (spec §10.2, §10.3).
installTrustedTypesPolicy(
  (window as { trustedTypes?: TrustedTypesLike }).trustedTypes,
  window.location.origin,
);
installDropGuard(window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
