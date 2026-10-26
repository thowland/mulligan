// Trusted Types default policy (spec §10.3). The CSP requires Trusted Types for every script sink.
// The only sink Mulligan uses is the Worker constructor for its own render worker, so the default
// policy converts exactly that URL and nothing else; HTML and script conversions are not defined,
// so innerHTML-style sinks keep throwing.

/** Same-origin paths of the render worker: the hashed production chunk, or the dev module. */
const WORKER_PATH = /^\/(assets\/render\.worker-[\w-]+\.js|src\/render\/render\.worker\.ts)$/;

export interface TrustedTypesLike {
  createPolicy(name: string, rules: { createScriptURL: (input: string) => string | null }): unknown;
}

export function allowedWorkerUrl(input: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(input, origin);
  } catch {
    return null;
  }
  return url.origin === origin && WORKER_PATH.test(url.pathname) ? url.href : null;
}

/** Installs the policy where Trusted Types exist; returns whether it was installed. */
export function installTrustedTypesPolicy(
  trustedTypes: TrustedTypesLike | undefined,
  origin: string,
): boolean {
  if (!trustedTypes) return false;
  trustedTypes.createPolicy('default', {
    createScriptURL: (input) => allowedWorkerUrl(input, origin),
  });
  return true;
}
