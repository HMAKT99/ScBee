import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectLicense, fetchGithubSignals, readTreeFacts, scoreProject } from "@scbee/registry-core";
import { run, type Deps } from "./main.js";
import { MARKER, render, score, toSignals, type RepoMeta } from "./report.js";
import { dirTree, ensureCommit, gitIn, gitTree } from "./trees.js";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const README_BASE = "# thing\n\nA tool.\n";
const README_HEAD = `# thing

A tiny tool that rehearses risky agent actions before they run.

## Install

\`\`\`bash
npx thing init
\`\`\`

## Usage

\`\`\`js
thing("hello");
\`\`\`
`;
const MIT = "MIT License\n\nCopyright (c) 2026\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software...";

const tmp: string[] = [];
afterAll(() => { for (const d of tmp) rmSync(d, { recursive: true, force: true }); });
const folder = (files: Record<string, string>) => {
  const d = mkdtempSync(join(tmpdir(), "scbee-action-"));
  tmp.push(d);
  for (const [p, body] of Object.entries(files)) { mkdirSync(join(d, p, ".."), { recursive: true }); writeFileSync(join(d, p), body); }
  return d;
};

describe("reading a tree", () => {
  it("a checked-out folder gives the same facts as GitHub's API for the same files", async () => {
    const files = { "README.md": README_HEAD, "SECURITY.md": "report privately", "llms.txt": "x", "AGENTS.md": "x", ".github/workflows/ci.yml": "on: push" };
    const local = await readTreeFacts(dirTree(folder(files)), { owner: "o", repo: "r" });
    const api = "https://api.github.com/repos/o/r";
    const served: Record<string, { status: number; body: string }> = {
      [api]: { status: 200, body: JSON.stringify({ description: "d", topics: [], license: null, created_at: "2026-10-01T00:00:00Z", pushed_at: "2026-11-20T00:00:00Z" }) },
      [`${api}/contents`]: { status: 200, body: JSON.stringify(["README.md", "SECURITY.md", "llms.txt", "AGENTS.md"].map((name) => ({ name, type: "file" })).concat([{ name: ".github", type: "dir" }])) },
      [`${api}/contents/.github`]: { status: 200, body: JSON.stringify([{ name: "workflows", type: "dir" }]) },
      "https://raw.githubusercontent.com/o/r/HEAD/README.md": { status: 200, body: README_HEAD },
    };
    const remote = await fetchGithubSignals("o", "r", { listed: false, verified: false }, {
      lookup: async () => [{ address: "140.82.112.3", family: 4 }],
      requester: async (r: { url: URL }) => served[r.url.toString()] ?? { status: 404, body: "" },
    } as any);
    expect({ hasCi: local.hasCi, hasSecurityPolicy: local.hasSecurityPolicy, agent: local.agent, readme: local.readme })
      .toEqual({ hasCi: remote.hasCi, hasSecurityPolicy: remote.hasSecurityPolicy, agent: remote.agent, readme: remote.readme });
  });

  it("never reads through a symlink that points outside the checkout", async () => {
    const outside = folder({ "secret.txt": "token" });
    const d = folder({ "README.md": README_HEAD });
    symlinkSync(join(outside, "secret.txt"), join(d, "LICENSE"));
    expect(await dirTree(d).text("LICENSE")).toBeNull();
    expect(await dirTree(d).text("../" + outside.split("/").pop() + "/secret.txt")).toBeNull();
    expect(await dirTree(d).text("README.md")).toBe(README_HEAD);
  });

  it("a git commit's files read the same as the same files on disk", async () => {
    const d = folder({ "README.md": README_BASE });
    const g = (...a: string[]) => execFileSync("git", a, { cwd: d, encoding: "utf8" }).trim();
    g("init", "-q"); g("-c", "user.email=t@t", "-c", "user.name=t", "add", "."); g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
    const baseSha = g("rev-parse", "HEAD");
    writeFileSync(join(d, "README.md"), README_HEAD); writeFileSync(join(d, "LICENSE"), MIT);
    const git = gitIn(d);
    expect(ensureCommit(git, baseSha)).toBe(true);
    const fromGit = await readTreeFacts(gitTree(git, baseSha), { owner: "o", repo: "r" });
    const fromDisk = await readTreeFacts(dirTree(folder({ "README.md": README_BASE })), { owner: "o", repo: "r" });
    expect(fromGit).toEqual(fromDisk);
    // and the working tree (the PR) is different from the base commit
    const head = await readTreeFacts(dirTree(d), { owner: "o", repo: "r" });
    expect(head.readme.hasInstallCommand).toBe(true);
    expect(fromGit.readme.hasInstallCommand).toBe(false);
    expect(() => gitTree(git, "HEAD; rm -rf /")).toThrow();
  });

  it("detects the common licences from their text", () => {
    expect(detectLicense(MIT)).toBe("MIT");
    expect(detectLicense("Apache License\nVersion 2.0, January 2004")).toBe("Apache-2.0");
    expect(detectLicense("Redistribution and use in source and binary forms ... Neither the name of")).toBe("BSD-3-Clause");
    expect(detectLicense("GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007")).toBe("GPL-3.0");
    expect(detectLicense("Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.")).toBe("ISC");
    expect(detectLicense("all rights reserved")).toBe("NOASSERTION");
  });
});

const META: RepoMeta = { owner: "o", repo: "r", description: "A tool", homepage: null, topics: [], license: null, stars: 0, forks: 0, openIssues: 0, createdAt: "2026-11-01T00:00:00Z", pushedAt: "2026-11-20T00:00:00Z", archived: false, hasRelease: false };

describe("the report", () => {
  it("scores a tree exactly like the website scores the same signals", async () => {
    const facts = await readTreeFacts(dirTree(folder({ "README.md": README_HEAD, LICENSE: MIT })), { owner: "o", repo: "r" });
    const s = toSignals(META, facts);
    expect(s.license).toBe("MIT");
    expect(score(s, NOW).launch).toEqual(scoreProject(s, NOW));
  });

  it("shows the change against the base, what the PR changed, and three fixes, and escapes table text", async () => {
    const head = score(toSignals(META, await readTreeFacts(dirTree(folder({ "README.md": README_HEAD, LICENSE: MIT })), { owner: "o", repo: "r" })), NOW);
    const base = score(toSignals(META, await readTreeFacts(dirTree(folder({ "README.md": README_BASE })), { owner: "o", repo: "r" })), NOW);
    const md = render({ head, base, baseRef: "main|x", sha: "abcdef1234567" });
    expect(md.startsWith(MARKER)).toBe(true);
    expect(md).toContain(`+${head.launch.total - base.launch.total} vs`);
    expect(md).toContain("**What this PR changed**");
    expect(md).toContain("License (Launch readiness): +7");
    expect((md.match(/^\d\. \*\*/gm) ?? []).length).toBe(3);
    expect(md).toContain("main\\|x");
    expect(md).toContain("`abcdef1`");
  });
});

type Call = { url: string; method: string; body?: string };
const harness = (over: Partial<Deps> & { comments?: any[]; status?: number } = {}) => {
  const calls: Call[] = [];
  const f = (async (url: string, init: any = {}) => {
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body });
    const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (method === "GET" && url.includes("/comments")) return ok(over.comments ?? []);
    if (method === "GET" && url.endsWith("/releases/latest")) return ok({}, 404);
    if (method === "GET" && url.includes("/tags")) return ok([]);
    if (method !== "GET") return ok({}, over.status ?? 201);
    return ok({}, 404);
  }) as unknown as typeof fetch;
  const headDir = folder({ "README.md": README_HEAD, LICENSE: MIT });
  const baseDir = folder({ "README.md": README_BASE });
  const event = {
    repository: { full_name: "o/r", description: "A tool", topics: [], created_at: "2026-11-01T00:00:00Z", pushed_at: "2026-11-20T00:00:00Z" },
    pull_request: { number: 7, base: { sha: "b".repeat(40), ref: "main" }, head: { sha: "c".repeat(40), repo: { full_name: "o/r" } } },
  };
  const deps: Deps = {
    env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", "INPUT_GITHUB-TOKEN": "t" },
    event, fetch: f, headTree: dirTree(headDir), baseTree: () => dirTree(baseDir), now: NOW, ...over,
  };
  return { deps, calls, writes: () => calls.filter((c) => c.method !== "GET") };
};

describe("running on a pull request", () => {
  it("reads inputs the way the runner passes them (INPUT_GITHUB-TOKEN, hyphen kept)", async () => {
    const real = harness({ env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", "INPUT_GITHUB-TOKEN": "t", "INPUT_FAIL-UNDER": "99" } });
    const r = await run(real.deps);
    expect(real.writes()).toHaveLength(1);
    expect(r.code).toBe(1);
    // the underscore spelling still works for direct calls
    const direct = harness({ env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", INPUT_GITHUB_TOKEN: "t" } });
    await run(direct.deps);
    expect(direct.writes()).toHaveLength(1);
  });

  it("posts one comment on the pull request that triggered it, and nowhere else", async () => {
    const h = harness();
    const r = await run(h.deps);
    expect(r.code).toBe(0);
    expect(h.writes()).toEqual([expect.objectContaining({ url: "https://api.github.com/repos/o/r/issues/7/comments", method: "POST" })]);
    expect(JSON.parse(h.writes()[0]!.body!).body.startsWith(MARKER)).toBe(true);
    expect(r.outputs["score-change"]).not.toBe("");
    // reads stay inside this repository too
    for (const c of h.calls) expect(c.url.startsWith("https://api.github.com/repos/o/r/")).toBe(true);
  });

  it("edits its own earlier comment on later pushes, and ignores a person's comment that quotes the marker", async () => {
    const h = harness({ comments: [{ id: 1, body: `${MARKER} quoted by a person`, user: { type: "User" } }, { id: 42, body: `${MARKER}\nold`, user: { type: "Bot" } }] });
    await run(h.deps);
    expect(h.writes()).toEqual([expect.objectContaining({ url: "https://api.github.com/repos/o/r/issues/comments/42", method: "PATCH" })]);
  });

  it("on a pull request from a fork, writes nothing and still succeeds, with the scores in the job summary", async () => {
    const h = harness();
    h.deps.event.pull_request.head.repo = { full_name: "someone/r" };
    const r = await run(h.deps);
    expect(h.writes()).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.summary).toContain("ScBee: launch readiness");
    expect(r.log.join(" ")).toContain("fork");
  });

  it("a read-only token (403) never fails the run", async () => {
    const h = harness({ status: 403 });
    const r = await run(h.deps);
    expect(r.code).toBe(0);
    expect(r.log.join(" ")).toContain("HTTP 403");
  });

  it("fail-under fails only below the number, and a bad value is ignored", async () => {
    expect((await run(harness({ env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", "INPUT_GITHUB-TOKEN": "t", "INPUT_FAIL-UNDER": "99" } }).deps)).code).toBe(1);
    expect((await run(harness({ env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", "INPUT_GITHUB-TOKEN": "t", "INPUT_FAIL-UNDER": "1" } }).deps)).code).toBe(0);
    const bad = await run(harness({ env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "pull_request", "INPUT_GITHUB-TOKEN": "t", "INPUT_FAIL-UNDER": "lots" } }).deps);
    expect(bad.code).toBe(0);
    expect(bad.log.join(" ")).toContain("fail-under must be a number");
  });

  it("outside a pull request (a push), reports in the summary and comments nowhere", async () => {
    const h = harness({ env: { GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_NAME: "push", "INPUT_GITHUB-TOKEN": "t" } });
    const r = await run(h.deps);
    expect(h.writes()).toEqual([]);
    expect(r.outputs["score-change"]).toBe("");
  });

  it("when the base cannot be read, still comments, without a comparison", async () => {
    const h = harness({ baseTree: () => null });
    const r = await run(h.deps);
    expect(r.summary).toContain("Could not read the base branch");
    expect(h.writes()).toHaveLength(1);
  });
});
