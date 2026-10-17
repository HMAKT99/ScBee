import { safeFetchJson, safeFetchText, UnsafeUrlError, type FetchOptions } from "./safeFetch.js";
import { analyseReadme, type ProjectSignals } from "./signals.js";

export class ProjectError extends Error {
  constructor(message: string, readonly status: 404 | 429 | 502 = 502) {
    super(message);
  }
}

interface GhRepo {
  full_name?: string;
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

  const [root, ghDir, release] = await Promise.all([call("/contents"), call("/contents/.github"), call("/releases/latest")]);
  const names = new Set(((Array.isArray(root) ? root : []) as GhEntry[]).map((e) => e.name.toLowerCase()));
  const ghNames = new Set(((Array.isArray(ghDir) ? ghDir : []) as GhEntry[]).map((e) => e.name.toLowerCase()));
  const hasCi = ghNames.has("workflows") || names.has(".travis.yml") || names.has(".circleci") || names.has(".gitlab-ci.yml");

  const raw = (file: string) => `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;
  const text = async (file: string): Promise<string | null> => {
    try {
      const r = await safeFetchText(raw(file), { ...opts, maxBytes: 512 * 1024 });
      return r.status === 200 ? r.body : null;
    } catch { return null; }
  };
  const readmeEntry = ((Array.isArray(root) ? root : []) as GhEntry[]).find((e) => e.type === "file" && /^readme(\.(md|markdown|rst|txt))?$/i.test(e.name));
  const readme = readmeEntry ? await text(encodeURIComponent(readmeEntry.name)) : null;

  let runtimeDeclared = names.has(".nvmrc") || names.has(".node-version") || names.has(".python-version") || names.has(".tool-versions") || names.has("go.mod") || names.has("cargo.toml") || names.has("dockerfile");
  if (!runtimeDeclared && names.has("package.json")) {
    const pj = await text("package.json");
    try { runtimeDeclared = !!(JSON.parse(pj ?? "{}") as { engines?: unknown }).engines; } catch { /* ignore */ }
  }
  if (!runtimeDeclared && names.has("pyproject.toml")) runtimeDeclared = /requires-python/.test((await text("pyproject.toml")) ?? "");

  let hasAgentCard = names.has("agent.json");
  if (!hasAgentCard) hasAgentCard = (await safeFetchJson(raw(".well-known/agent-card.json"), opts).catch(() => null)) != null;

  return {
    source: `github:${owner}/${repo}`,
    fullName: meta.full_name,
    description: meta.description ?? null,
    topics: meta.topics ?? [],
    license: meta.license?.spdx_id ?? null,
    stars: meta.stargazers_count ?? 0,
    forks: meta.forks_count ?? 0,
    openIssues: meta.open_issues_count ?? 0,
    createdAt: meta.created_at ?? null,
    pushedAt: meta.pushed_at ?? null,
    archived: !!meta.archived,
    hasCi,
    hasSecurityPolicy: names.has("security.md") || ghNames.has("security.md"),
    hasRelease: release != null && typeof release === "object" && "tag_name" in (release as object),
    runtimeDeclared,
    hasAgentCard,
    listedOnScbee: scbee.listed,
    verifiedOnScbee: scbee.verified,
    readme: analyseReadme(readme),
  };
}
