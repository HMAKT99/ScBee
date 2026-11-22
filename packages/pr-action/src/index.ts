import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { input, run } from "./main.js";
import { dirTree, ensureCommit, gitIn, gitTree } from "./trees.js";

// Entry point for the GitHub Action. Any unexpected error is reported and the run ends without failing, unless the
// user asked for fail-under and the score is below it: the check should never break a build by accident.
const env = process.env;
const dir = resolve(env.GITHUB_WORKSPACE ?? ".", input(env, "path") || ".");
const git = gitIn(dir);
let event: unknown = null;
try { if (env.GITHUB_EVENT_PATH) event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")); } catch { /* no event */ }

try {
  const r = await run({
    env, event, fetch,
    headTree: dirTree(dir),
    baseTree: (sha) => (ensureCommit(git, sha) ? gitTree(git, sha) : null),
  });
  for (const line of r.log) console.log(line);
  if (env.GITHUB_STEP_SUMMARY && r.summary) appendFileSync(env.GITHUB_STEP_SUMMARY, r.summary + "\n");
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, Object.entries(r.outputs).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  process.exitCode = r.code;
} catch (e) {
  console.log(`::warning::ScBee could not score this run: ${e instanceof Error ? e.message : String(e)}`);
}
