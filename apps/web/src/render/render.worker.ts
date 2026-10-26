// Worker bootstrap: hosts the canvas pixel engine off the main thread (spec §9.4). Excluded from
// unit-test coverage because it only runs inside a real browser worker; the engine itself is
// covered by @mulligan/render-canvas's browser tests and the RPC wiring by service.test.ts.
import { createCanvasEngine } from '@mulligan/render-canvas';
import { expose } from 'comlink';
import { createRenderApi } from './api.ts';

expose(createRenderApi(createCanvasEngine()));
