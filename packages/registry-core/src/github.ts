import { safeFetchJson, safeFetchText, UnsafeUrlError, type FetchOptions } from "./safeFetch.js";
import { analyseReadme, type ProjectSignals } from "./signals.js";
import { readTreeFacts, type RepoTree } from "./tree.js";

export class ProjectError extends Error {
  constructor(message: string, readonly status: 404 | 429 | 502 = 502) {
    super(message);
  }
}

interface GhRepo {
  full_name?: string;
  homepage?: string | null;
  description?: string | null;
  topics?: string[];
  license?: { spdx_id?: string | null } | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  created_at?: string;
  pushed_at?: string;
  archived?: boolean;
  fork?: boolean;
}
interface GhEntry { name: string; type: string }

const httpsOrNull = (u: unknown): string | null => {
  try { const x = new URL(String(u)); return x.protocol === "https:" && !x.username && !x.password && x.href.length <= 500 ? x.href : null; } catch { return null; }
};

export interface ScbeeFacts { listed: boolean; verified: boolean }

/**
 * Gather scoring signals for a public GitHub repo. Uses api.github.com (token optional but strongly
 * recommended: 60 requests/hour per IP without one) and raw.githubusercontent.com for files.
 * Only public data is read.
 */
export async function fetchGithubSignals(
  owner: string, repo: string, scbee: ScbeeFacts, opts: FetchOptions = {}, token?: string,
): Promise<ProjectSignals> {
  const api = (): FetchOptions => ({
    ...opts, maxBytes: 512 * 1024,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const call = async (path: string) => {
    try {
      const res = await safeFetchText(base + path, api());
      if (res.status === 403 || res.status === 429) throw new ProjectError("GitHub is rate-limiting us right now; try again in a few minutes.", 429);
      if (res.status === 404) return null;
      if (res.status !== 200) throw new ProjectError("could not read this repository from GitHub");
      try { return JSON.parse(res.body) as unknown; } catch { return null; }
    } catch (e) {
      if (e instanceof ProjectError) throw e;
      if (e instanceof UnsafeUrlError) throw new ProjectError("could not read this repository from GitHub");
      throw new ProjectError("could not reach GitHub");
    }
  };

  const meta = (await call("")) as GhRepo | null;
  if (!meta) throw new ProjectError("repository not found, or it is private", 404);

  const raw = (file: string) => `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;
  // The default branch, read through GitHub: the same file rules as a checked-out tree (see tree.ts).
  const tree: RepoTree = {
    root: async () => {
      const r = await call("/contents");
      return ((Array.isArray(r) ? r : []) as GhEntry[]).map((e) => ({ name: e.name, type: e.type === "dir" ? "dir" as const : "file" as const }));
    },
    names: async (dir) => {
      const r = await call(`/contents/${dir}`);
      return new Set(((Array.isArray(r) ? r : []) as GhEntry[]).map((e) => e.name.toLowerCase()));
    },
    text: async (file) => {
      try {
        const r = await safeFetchText(raw(file.split("/").map(encodeURIComponent).join("/")), { ...opts, maxBytes: 512 * 1024 });
        return r.status === 200 ? r.body : null;
      } catch { return null; }
    },
    exists: async (file) => (await call(`/contents/${file}`)) != null,
  };
  const [facts, release] = await Promise.all([readTreeFacts(tree, { owner, repo }, opts), call("/releases/latest")]);
  // A pushed version tag lets people pin a version even without a GitHub Release.
  let hasRelease = release != null && typeof release === "object" && "tag_name" in (release as object);
  if (!hasRelease) { const tags = await call("/tags?per_page=1"); hasRelease = Array.isArray(tags) && tags.length > 0; }
  return {
    source: `github:${owner}/${repo}`,
    fullName: meta.full_name,
    description: meta.description ?? null,
    homepage: httpsOrNull(meta.homepage),
    topics: meta.topics ?? [],
    license: meta.license?.spdx_id ?? null,
    stars: meta.stargazers_count ?? 0,
    forks: meta.forks_count ?? 0,
    openIssues: meta.open_issues_count ?? 0,
    createdAt: meta.created_at ?? null,
    pushedAt: meta.pushed_at ?? null,
    archived: !!meta.archived,
    hasCi: facts.hasCi,
    hasSecurityPolicy: facts.hasSecurityPolicy,
    hasRelease,
    runtimeDeclared: facts.runtimeDeclared,
    hasAgentCard: facts.hasAgentCard,
    agent: facts.agent,
    ...(facts.npmPackage ? { npmPackage: facts.npmPackage, npmDownloadsMonthly: facts.npmDownloadsMonthly } : {}),
    ...(facts.dependencies?.length ? { dependencies: facts.dependencies } : {}),
    listedOnScbee: scbee.listed,
    verifiedOnScbee: scbee.verified,
    readme: facts.readme,
  };
}

/**
 * A light read for drafting a listing: two GitHub API calls (repo + README), nothing else.
 * Also tells us whether the repo exists and is public.
 */
export async function fetchDraftSignals(owner: string, repo: string, opts: FetchOptions = {}, token?: string): Promise<ProjectSignals> {
  const o: FetchOptions = {
    ...opts, maxBytes: 768 * 1024,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  };
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const get = async (path: string): Promise<unknown | null> => {
    try {
      const res = await safeFetchText(base + path, o);
      if (res.status === 403 || res.status === 429) throw new ProjectError("GitHub is rate-limiting us right now; try again in a few minutes.", 429);
      if (res.status === 404) return null;
      if (res.status !== 200) throw new ProjectError("could not read this repository from GitHub");
      try { return JSON.parse(res.body); } catch { return null; }
    } catch (e) {
      if (e instanceof ProjectError) throw e;
      throw new ProjectError("could not reach GitHub");
    }
  };
  const meta = (await get("")) as GhRepo | null;
  if (!meta) throw new ProjectError("repository not found, or it is private", 404);
  const rd = (await get("/readme")) as { content?: string; encoding?: string } | null;
  const md = rd?.encoding === "base64" && typeof rd.content === "string" ? Buffer.from(rd.content, "base64").toString("utf8") : null;
  return {
    source: `github:${owner}/${repo}`, fullName: meta.full_name, description: meta.description ?? null, homepage: httpsOrNull(meta.homepage),
    topics: meta.topics ?? [], license: meta.license?.spdx_id ?? null, stars: meta.stargazers_count ?? 0, forks: meta.forks_count ?? 0,
    openIssues: meta.open_issues_count ?? 0, createdAt: meta.created_at ?? null, pushedAt: meta.pushed_at ?? null, archived: !!meta.archived,
    hasCi: false, hasSecurityPolicy: false, hasRelease: false, runtimeDeclared: false, hasAgentCard: false,
    listedOnScbee: true, verifiedOnScbee: false, readme: analyseReadme(md),
  };
}
