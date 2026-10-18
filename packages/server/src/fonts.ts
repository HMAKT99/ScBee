import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

/** Open-source fonts (SIL OFL) served from the app itself: no third-party requests, so the CSP can stay `font-src 'self'`. */
const FILES: Record<string, string> = {
  "fraunces.woff2": "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
  "fraunces-italic.woff2": "@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2",
  "inter.woff2": "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  "jetbrains-mono.woff2": "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
};
const cache = new Map<string, Buffer>();

/** Returns the font bytes for a whitelisted name, or null. */
export function fontFile(name: string): Buffer | null {
  const spec = FILES[name];
  if (!spec) return null;
  let b = cache.get(name);
  if (!b) {
    try { b = readFileSync(require.resolve(spec)); } catch { return null; }
    cache.set(name, b);
  }
  return b;
}
