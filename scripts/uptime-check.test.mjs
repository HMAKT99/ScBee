import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHECKS, checkAll } from "./uptime-check.mjs";

const bodies = {
  "/api/stats": () => ({ status: 200, body: JSON.stringify({ verified_agents: 8 }) }),
  "/": () => ({ status: 200, body: "<html><head><title>ScBee: where agents find each other</title></head></html>" }),
  "/api/handoff?need=check%20files": () => ({ status: 200, body: JSON.stringify({ matches: [] }) }),
  "/.well-known/jwks.json": () => ({ status: 200, body: JSON.stringify({ keys: [{ kty: "OKP" }] }) }),
  "/openapi.json": () => ({ status: 200, body: JSON.stringify({ paths: {} }) }),
};
const fake = (over = {}, calls = []) => async (url) => {
  const path = url.replace("https://s.test", ""); calls.push(path);
  const h = over[path] ?? bodies[path]; const r = typeof h === "function" ? h() : h;
  if (r instanceof Error) throw r;
  return new Response(r.body, { status: r.status });
};
const fast = { retries: 2, waitMs: 0, sleep: async () => {} };

describe("uptime check", () => {
  it("passes when every public check answers as expected", async () => {
    const calls = [];
    const r = await checkAll("https://s.test", fake({}, calls), fast);
    expect(r.ok).toBe(true);
    expect(r.failed).toEqual([]);
    expect(calls).toHaveLength(CHECKS.length); // one request each, no retries when healthy
    expect(r.lines.every((l) => l.startsWith("ok"))).toBe(true);
  });

  it("reports a failing check after retrying, and names it", async () => {
    const calls = [];
    const r = await checkAll("https://s.test", fake({ "/api/stats": { status: 502, body: "bad gateway" } }, calls), fast);
    expect(r.ok).toBe(false);
    expect(r.failed.map((c) => c.path)).toEqual(["/api/stats"]);
    expect(r.lines.find((l) => l.startsWith("FAIL"))).toContain("/api/stats");
    expect(calls.filter((p) => p === "/api/stats")).toHaveLength(3); // the first try and 2 retries
  });

  it("does not alert on a single blip", async () => {
    let n = 0;
    const r = await checkAll("https://s.test", fake({ "/": () => (++n === 1 ? { status: 503, body: "" } : bodies["/"]()) }), fast);
    expect(r.ok).toBe(true);
  });

  it("treats a network error, a wrong body and a missing field as failures", async () => {
    const r = await checkAll("https://s.test", fake({
      "/api/stats": new Error("connect ETIMEDOUT"),
      "/": { status: 200, body: "<title>Something else</title>" },
      "/openapi.json": { status: 200, body: "{}" },
    }), { retries: 0, waitMs: 0, sleep: async () => {} });
    expect(r.failed.map((c) => c.path).sort()).toEqual(["/", "/api/stats", "/openapi.json"]);
    expect(r.lines.join("\n")).toContain("connect ETIMEDOUT");
  });

  it("the workflow is calm and uses no secrets: twice an hour, read-only, one job with a timeout", () => {
    const y = readFileSync(new URL("../.github/workflows/uptime.yml", import.meta.url), "utf8");
    expect(y).toMatch(/cron: "\d+,\d+ \* \* \* \*"/); // two runs an hour, off the hour mark
    expect(y).toContain("workflow_dispatch");
    expect(y).toMatch(/permissions:\n  contents: read/);
    expect(y).toContain("timeout-minutes: 5");
    expect(y).not.toMatch(/secrets\.|GITHUB_TOKEN|pull_request|push:/);
    expect(y).toContain("node scripts/uptime-check.mjs");
  });
});
