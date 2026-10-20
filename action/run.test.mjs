import { describe, expect, it } from "vitest";
import { markdown, run } from "./run.mjs";

const score = (total, band, fix) => ({ project: "github.com/o/r", band, total, components: [{ title: "Clarity", score: total, max: 100, items: fix ? [{ label: "L", points: 0, max: 5, reason: "r", fix }] : [] }] });
const resp = (o, status = 200) => ({ ok: status < 300, status, json: async () => o });
const make = (over = {}) => {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body });
    const u = String(url);
    if (u.includes("/api/score/")) return over.score ?? resp(score(72, "Nearly there", "Add a screenshot."));
    if (u.includes("/api/agent-ready/")) return over.agent ?? resp(score(55, "Partly", "Add llms.txt."));
    if (u.includes("/comments?")) return over.existing ?? resp([]);
    if (u.includes("/issues/comments/")) return resp({}, 200);
    if (u.endsWith("/comments")) return resp({}, 201);
    return resp({}, 404);
  };
  return { f, calls };
};
const env = { GITHUB_REPOSITORY: "o/r", INPUT_URL: "https://s.test" };

describe("ScBee GitHub Action", () => {
  it("reports both scores in the summary and writes nothing to GitHub by default", async () => {
    const { f, calls } = make();
    const r = await run(env, f);
    expect(r.code).toBe(0);
    expect(r.log).toContain("readiness 72/100 (Nearly there); agent-ready 55/100 (Partly)");
    expect(r.summary).toContain("| Launch readiness | **72/100** | Nearly there |");
    expect(r.summary).toContain("| Agent-ready | **55/100** | Partly |");
    expect(r.summary).toContain("- Add a screenshot. (+5)");
    expect(r.summary).toContain("https://s.test/github.com/o/r");
    expect(r.outputs).toEqual({ readiness: "72", agent_ready: "55" });
    expect(calls.every((c) => c.method === "GET" && c.url.startsWith("https://s.test/"))).toBe(true);
  });

  it("fails the job below the thresholds", async () => {
    const { f } = make();
    expect((await run({ ...env, INPUT_MIN_SCORE: "80" }, f)).code).toBe(2);
    expect((await run({ ...env, INPUT_MIN_SCORE: "70" }, f)).code).toBe(0);
    const r = await run({ ...env, INPUT_MIN_SCORE: "60", INPUT_MIN_AGENT_READY: "60" }, f);
    expect(r.code).toBe(2);
    expect(r.log).toContain("agent-ready 55 is below 60");
  });

  it("posts exactly one comment on a pull request, and updates it in place the next time", async () => {
    const withPr = { ...env, INPUT_COMMENT: "true", INPUT_GITHUB_TOKEN: "t", GITHUB_EVENT_PATH: "/e.json" };
    const ev = () => ({ pull_request: { number: 7 } });
    const first = make();
    expect((await run(withPr, first.f, ev)).log).toContain("Posted one pull request comment.");
    expect(first.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(first.calls.find((c) => c.method === "POST").url).toBe("https://api.github.com/repos/o/r/issues/7/comments");
    expect(JSON.parse(first.calls.find((c) => c.method === "POST").body).body).toContain("<!-- scbee-action -->");
    const again = make({ existing: resp([{ id: 99, body: "old\n<!-- scbee-action -->" }, { id: 5, body: "someone else" }]) });
    expect((await run(withPr, again.f, ev)).log).toContain("Updated the pull request comment.");
    expect(again.calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(again.calls.find((c) => c.method === "PATCH").url).toBe("https://api.github.com/repos/o/r/issues/comments/99");
    // not a pull request, or comments off: nothing is written
    const push = make();
    await run(withPr, push.f, () => ({ ref: "refs/heads/main" }));
    expect(push.calls.some((c) => c.method !== "GET")).toBe(false);
    const off = make();
    await run({ ...withPr, INPUT_COMMENT: "false" }, off.f, ev);
    expect(off.calls.some((c) => c.method !== "GET")).toBe(false);
  });

  it("explains errors, and still has the scores when the agent-ready check is unavailable", async () => {
    const priv = await run(env, make({ score: resp({ error: "repository not found, or it is private" }, 404) }).f);
    expect(priv.code).toBe(1);
    expect(priv.log).toContain("Private repositories cannot be scored.");
    expect((await run({}, make().f)).code).toBe(1);
    expect((await run({ GITHUB_REPOSITORY: "not a repo" }, make().f)).code).toBe(1);
    const partial = await run(env, make({ agent: resp({ error: "x" }, 503) }).f);
    expect(partial.code).toBe(0);
    expect(partial.summary).toContain("| Agent-ready | not available | |");
    expect(markdown("github.com/o/r", score(90, "Launch ready"), null, "https://s.test")).toContain("nothing major to fix");
  });
});
