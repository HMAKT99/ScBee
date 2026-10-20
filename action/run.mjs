// The ScBee GitHub Action. Reads two public scores for this repository and reports them in the job summary,
// optionally as one comment on the pull request. It uses the workflow's own GITHUB_TOKEN, only for that comment,
// and never posts anywhere else. No dependencies: plain Node (18 or newer).
import { appendFileSync, readFileSync } from "node:fs";

const BASE = (env) => (env.INPUT_URL || "https://scbee.vercel.app").replace(/\/$/, "");
const num = (v) => (v === undefined || v === "" ? undefined : Number(v));
const fixes = (j, n = 3) => j.components.flatMap((c) => c.items.filter((i) => i.fix && i.points < i.max).map((i) => ({ i, c: c.title })))
  .sort((a, b) => (b.i.max - b.i.points) - (a.i.max - a.i.points)).slice(0, n);

export function markdown(project, s, a, url) {
  const row = (title, j) => `| ${title} | **${j.total}/100** | ${j.band} |`;
  const list = (j) => fixes(j).map((x) => `- ${x.i.fix} (+${x.i.max - x.i.points})`).join("\n") || "- nothing major to fix";
  return `## ScBee scores for \`${project}\`

| Score | Result | Band |
|---|---|---|
${row("Launch readiness", s)}
${a ? row("Agent-ready", a) : "| Agent-ready | not available | |"}

**Biggest wins, readiness**
${list(s)}
${a ? `\n**Biggest wins, agent-ready**\n${list(a)}\n` : ""}
[Full report](${url}/${project}). A score is about readiness, not a prediction. <!-- scbee-action -->
`;
}

async function getJson(f, url) {
  const r = await f(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, j };
}

/** Returns { code, log, summary } and performs the optional PR comment through the injected fetch. */
export async function run(env, f = fetch, readEvent = (p) => JSON.parse(readFileSync(p, "utf8"))) {
  const url = BASE(env);
  const repo = env.INPUT_REPOSITORY || env.GITHUB_REPOSITORY;
  if (!repo || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo)) return { code: 1, log: "No repository to score (set the repository input or run inside GitHub Actions).", summary: "" };
  const project = `github.com/${repo}`;
  const [s, a] = await Promise.all([getJson(f, `${url}/api/score/${project}`), getJson(f, `${url}/api/agent-ready/${project}`)]);
  if (!s.ok) return { code: 1, log: `ScBee could not score ${repo}: ${s.j?.error ?? `HTTP ${s.status}`}. Private repositories cannot be scored.`, summary: "" };
  const summary = markdown(project, s.j, a.ok ? a.j : null, url);
  const min = num(env.INPUT_MIN_SCORE), minAgent = num(env.INPUT_MIN_AGENT_READY);
  const fails = [];
  if (min !== undefined && s.j.total < min) fails.push(`readiness ${s.j.total} is below ${min}`);
  if (minAgent !== undefined && a.ok && a.j.total < minAgent) fails.push(`agent-ready ${a.j.total} is below ${minAgent}`);
  let note = "";
  if (env.INPUT_COMMENT === "true" && env.INPUT_GITHUB_TOKEN && env.GITHUB_EVENT_PATH) {
    try {
      const ev = readEvent(env.GITHUB_EVENT_PATH);
      const n = ev.pull_request?.number;
      if (n && env.GITHUB_REPOSITORY) {
        const api = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues`;
        const h = { authorization: `Bearer ${env.INPUT_GITHUB_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" };
        const existing = await f(`${api}/${n}/comments?per_page=50`, { headers: h }).then((r) => r.json()).catch(() => []);
        const mine = Array.isArray(existing) ? existing.find((c) => typeof c.body === "string" && c.body.includes("<!-- scbee-action -->")) : undefined;
        // One comment, updated in place: never a new comment per push.
        const r = mine ? await f(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/comments/${mine.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ body: summary }) })
          : await f(`${api}/${n}/comments`, { method: "POST", headers: h, body: JSON.stringify({ body: summary }) });
        note = r.ok ? (mine ? "Updated the pull request comment." : "Posted one pull request comment.") : `Could not comment (HTTP ${r.status}); the job summary still has the scores.`;
      }
    } catch { note = "Could not comment; the job summary still has the scores."; }
  }
  const log = `${s.j.project}: readiness ${s.j.total}/100 (${s.j.band}); agent-ready ${a.ok ? `${a.j.total}/100 (${a.j.band})` : "n/a"}. ${note}`.trim();
  return { code: fails.length ? 2 : 0, log: fails.length ? `${log}\nFailing: ${fails.join("; ")}.` : log, summary, outputs: { readiness: String(s.j.total), agent_ready: a.ok ? String(a.j.total) : "" } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await run(process.env);
  console.log(r.log);
  if (process.env.GITHUB_STEP_SUMMARY && r.summary) appendFileSync(process.env.GITHUB_STEP_SUMMARY, r.summary + "\n");
  if (process.env.GITHUB_OUTPUT && r.outputs) appendFileSync(process.env.GITHUB_OUTPUT, `readiness=${r.outputs.readiness}\nagent_ready=${r.outputs.agent_ready}\n`);
  process.exitCode = r.code;
}
