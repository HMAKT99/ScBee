import { readTreeFacts, type RepoTree } from "@scbee/registry-core";
import { MARKER, render, score, toSignals, type RepoMeta, type Scores } from "./report.js";

/** Everything the run touches from outside, so tests can replace it. */
export interface Deps {
  env: Record<string, string | undefined>;
  event: any;
  fetch: typeof fetch;
  headTree: RepoTree;
  /** The base commit's files, or null when they could not be read. */
  baseTree: (sha: string) => RepoTree | null;
  now?: number;
}

export interface Result {
  code: 0 | 1;
  summary: string;
  log: string[];
  outputs: Record<string, string>;
}

const API = "https://api.github.com";

/**
 * An action input as the runner passes it: `with: { fail-under: 70 }` arrives as INPUT_FAIL-UNDER (upper-cased, the
 * hyphen kept). The underscore spelling is accepted too, for anyone calling the script directly.
 */
export const input = (env: Record<string, string | undefined>, name: string): string =>
  (env[`INPUT_${name.toUpperCase()}`] ?? env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();

/** Repository-wide facts from the event payload, with releases and tags read through the API (reading is allowed even on forks). */
async function repoMeta(d: Deps, owner: string, repo: string, h: Record<string, string>): Promise<RepoMeta> {
  let r = d.event?.repository ?? null;
  if (!r || typeof r !== "object") {
    r = await d.fetch(`${API}/repos/${owner}/${repo}`, { headers: h }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  }
  const get = (path: string) => d.fetch(`${API}/repos/${owner}/${repo}${path}`, { headers: h }).then(async (x) => (x.ok ? x.json() : null)).catch(() => null);
  const release = await get("/releases/latest");
  let hasRelease = !!(release && typeof release === "object" && "tag_name" in release);
  if (!hasRelease) { const tags = await get("/tags?per_page=1"); hasRelease = Array.isArray(tags) && tags.length > 0; }
  const https = (u: unknown) => { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : null; } catch { return null; } };
  return {
    owner, repo,
    description: r?.description ?? null,
    homepage: https(r?.homepage),
    topics: Array.isArray(r?.topics) ? r.topics : [],
    license: r?.license?.spdx_id ?? null,
    stars: r?.stargazers_count ?? 0,
    forks: r?.forks_count ?? 0,
    openIssues: r?.open_issues_count ?? 0,
    createdAt: r?.created_at ?? null,
    pushedAt: typeof r?.pushed_at === "number" ? new Date(r.pushed_at * 1000).toISOString() : (r?.pushed_at ?? null),
    archived: !!r?.archived,
    hasRelease,
  };
}

/**
 * Score this checkout (and, on a pull request, its base) and report it. The only writes this ever makes are to one
 * comment on the pull request that triggered it, in the repository it runs in, through the workflow's own token.
 */
export async function run(d: Deps): Promise<Result> {
  const log: string[] = [];
  const env = d.env;
  const full = env.GITHUB_REPOSITORY ?? "";
  const [owner, repo] = full.split("/") as [string, string];
  if (!owner || !repo) return { code: 1, summary: "", log: ["GITHUB_REPOSITORY is not set; run this inside GitHub Actions."], outputs: {} };
  const token = input(env, "github-token");
  const h: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };

  const meta = await repoMeta(d, owner, repo, h);
  const now = d.now ?? Date.now();
  const scoreTree = async (t: RepoTree): Promise<Scores> => score(toSignals(meta, await readTreeFacts(t, { owner, repo })), now);

  const pr = d.event?.pull_request;
  const isPr = (env.GITHUB_EVENT_NAME === "pull_request") && pr && typeof pr.number === "number";
  const head = await scoreTree(d.headTree);
  let base: Scores | null = null;
  let note: string | undefined;
  if (isPr) {
    const bt = typeof pr.base?.sha === "string" ? d.baseTree(pr.base.sha) : null;
    if (bt) base = await scoreTree(bt);
    else note = "Could not read the base branch's files, so there is no comparison this time.";
  }

  const body = render({ head, base, baseRef: isPr ? pr.base?.ref ?? null : null, sha: isPr ? pr.head?.sha ?? null : env.GITHUB_SHA ?? null, note });
  let summary = body;

  if (isPr) {
    const fromFork = !pr.head?.repo || pr.head.repo.full_name !== full;
    if (fromFork) {
      log.push("Pull request from a fork: its token cannot comment, so the scores are in the job summary.");
    } else if (!token) {
      log.push("No github-token given: the scores are in the job summary.");
    } else {
      const issues = `${API}/repos/${owner}/${repo}/issues`;
      try {
        let mine: { id: number } | undefined;
        for (let page = 1; page <= 10 && !mine; page++) {
          const r = await d.fetch(`${issues}/${pr.number}/comments?per_page=100&page=${page}`, { headers: h });
          if (!r.ok) break;
          const list = (await r.json()) as { id: number; body?: string; user?: { type?: string } }[];
          mine = list.find((c) => c.user?.type === "Bot" && typeof c.body === "string" && c.body.startsWith(MARKER));
          if (list.length < 100) break;
        }
        const r = mine
          ? await d.fetch(`${issues}/comments/${mine.id}`, { method: "PATCH", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ body }) })
          : await d.fetch(`${issues}/${pr.number}/comments`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ body }) });
        log.push(r.ok ? (mine ? "Updated the ScBee comment on this pull request." : "Posted the ScBee comment on this pull request.")
          : `Could not comment (HTTP ${r.status}; the workflow may need \`permissions: pull-requests: write\`). The scores are in the job summary.`);
      } catch {
        log.push("Could not comment. The scores are in the job summary.");
      }
    }
  }

  const outputs: Record<string, string> = {
    score: String(head.launch.total),
    "agent-ready": head.agent ? String(head.agent.total) : "",
    "score-change": base ? String(head.launch.total - base.launch.total) : "",
  };

  const raw = input(env, "fail-under");
  let code: 0 | 1 = 0;
  if (raw !== "") {
    const min = Number(raw);
    if (!Number.isFinite(min) || min < 0 || min > 100) {
      log.push(`fail-under must be a number from 0 to 100 (got "${raw}"); ignoring it.`);
    } else if (head.launch.total < min) {
      code = 1;
      log.push(`::error::Launch readiness is ${head.launch.total}, below fail-under ${min}.`);
      summary += `\n**Check failed:** launch readiness ${head.launch.total} is below the minimum of ${min}.\n`;
    }
  }
  return { code, summary, log, outputs };
}
