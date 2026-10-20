// A small uptime check for the live site. No account or service needed: a scheduled GitHub workflow runs it, and GitHub emails the
// maintainer when it fails. It only reads public pages, a handful of requests each run, and retries before it reports a failure.
//   SITE_URL=https://scbee.vercel.app node scripts/uptime-check.mjs
import { appendFileSync } from "node:fs";

export const CHECKS = [
  { path: "/api/stats", what: "stats API", ok: (r) => r.status === 200 && typeof r.json?.verified_agents === "number" },
  { path: "/", what: "home page", ok: (r) => r.status === 200 && /<title>[^<]*ScBee/.test(r.text) },
  { path: "/api/handoff?need=check%20files", what: "find-an-agent API", ok: (r) => r.status === 200 && Array.isArray(r.json?.matches) },
  { path: "/.well-known/jwks.json", what: "identity key", ok: (r) => r.status === 200 && r.json?.keys?.[0]?.kty === "OKP" },
  { path: "/openapi.json", what: "OpenAPI contract", ok: (r) => r.status === 200 && typeof r.json?.paths === "object" },
];

async function once(base, check, f) {
  const t0 = Date.now();
  try {
    const res = await f(base + check.path, { headers: { "user-agent": "scbee-uptime/1.0", accept: "application/json, text/html" }, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { ok: !!check.ok({ status: res.status, text, json }), status: res.status, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, error: e instanceof Error ? e.message : "failed" }; }
}

/** Runs every check; a failing check is retried (default 2 more times, 10 seconds apart) so a single blip does not raise an alert. */
export async function checkAll(base, f = fetch, { retries = 2, waitMs = 10_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const results = [];
  for (const c of CHECKS) {
    let r = await once(base, c, f);
    for (let i = 0; i < retries && !r.ok; i++) { await sleep(waitMs); r = await once(base, c, f); }
    results.push({ ...c, ...r });
  }
  const failed = results.filter((r) => !r.ok);
  const lines = results.map((r) => `${r.ok ? "ok  " : "FAIL"} ${r.what.padEnd(20)} ${r.path}  ${r.status || r.error} (${r.ms} ms)`);
  return { ok: failed.length === 0, lines, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = (process.env.SITE_URL || "https://scbee.vercel.app").replace(/\/$/, "");
  const r = await checkAll(base);
  console.log([`Checked ${base}`, ...r.lines].join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Uptime: ${r.ok ? "all checks passed" : `${r.failed.length} failing`}\n\n\`\`\`\n${r.lines.join("\n")}\n\`\`\`\n`);
  process.exitCode = r.ok ? 0 : 1;
}
