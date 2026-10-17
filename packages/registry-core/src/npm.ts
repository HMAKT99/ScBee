import { safeFetchJson, type FetchOptions } from "./safeFetch.js";

/** npm package names: optionally scoped, lowercase, URL-safe. */
const NPM_NAME = /^(?:@[a-z0-9~][a-z0-9._~-]{0,213}\/)?[a-z0-9~][a-z0-9._~-]{0,213}$/;
export const isNpmName = (s: string) => s.length <= 214 && NPM_NAME.test(s);

export interface NpmFacts {
  name: string;
  description: string | null;
  license: string | null;
  engines: boolean;
  hasBin: boolean;
  downloadsLastMonth: number;
  repo: { owner: string; repo: string } | null;
}

/** Extract a GitHub owner/repo from the many shapes npm uses (git+https://, git://, github:o/r, o/r, object form). */
export function githubFromRepository(r: unknown): { owner: string; repo: string } | null {
  const url = typeof r === "string" ? r : typeof r === "object" && r !== null ? String((r as { url?: unknown }).url ?? "") : "";
  const m = url.trim().match(/(?:github:|(?:git\+)?(?:https?|ssh|git):\/\/(?:[^@/]+@)?(?:www\.)?github\.com[/:]|git@github\.com:)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:[#/?].*)?$/);
  if (!m || (!/github/i.test(url) && /[:@]|\./.test(url.split("/")[0] ?? ""))) return null;
  return { owner: m[1]!.toLowerCase(), repo: m[2]!.toLowerCase() };
}

/** Read the latest manifest and last-month downloads from the public npm registry. Returns null if the package does not exist. */
export async function fetchNpmFacts(name: string, opts: FetchOptions = {}): Promise<NpmFacts | null> {
  if (!isNpmName(name)) return null;
  const enc = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const o = { ...opts, maxBytes: 512 * 1024 };
  const m = (await safeFetchJson(`https://registry.npmjs.org/${enc}/latest`, o).catch(() => null)) as
    | { name?: string; description?: string; license?: unknown; engines?: unknown; bin?: unknown; repository?: unknown }
    | null;
  if (!m || typeof m !== "object" || m.name !== name) return null;
  const d = (await safeFetchJson(`https://api.npmjs.org/downloads/point/last-month/${enc}`, opts).catch(() => null)) as { downloads?: number } | null;
  return {
    name,
    description: typeof m.description === "string" ? m.description : null,
    license: typeof m.license === "string" ? m.license : null,
    engines: !!m.engines && typeof m.engines === "object",
    hasBin: !!m.bin,
    downloadsLastMonth: typeof d?.downloads === "number" && d.downloads >= 0 ? Math.floor(d.downloads) : 0,
    repo: githubFromRepository(m.repository),
  };
}

/** Accepts npmjs.com/package/<name>, npm:<name>, or a bare name. */
export function parseNpmInput(input: string): string | null {
  let s = input.trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?npmjs\.com\/package\/((?:@[^/]+\/)?[^/?#]+)/i);
  if (url) s = decodeURIComponent(url[1]!);
  else if (/^npm:/i.test(s)) s = s.slice(4);
  s = s.toLowerCase();
  return isNpmName(s) ? s : null;
}
