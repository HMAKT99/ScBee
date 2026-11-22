import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { RepoTree } from "@scbee/registry-core";

const MAX_BYTES = 512 * 1024;

/** A checked-out folder: the pull request's own files. Never reads outside `dir`, and never follows symlinks out of it. */
export function dirTree(dir: string): RepoTree {
  let root = resolve(dir);
  try { root = realpathSync(root); } catch { /* missing folder: everything reads as empty */ }
  // Resolve symlinks before checking, so a link inside the checkout cannot point the reader at the runner's other files.
  const inside = (p: string) => {
    let full = resolve(root, p);
    try { full = realpathSync(full); } catch { return null; }
    return full === root || full.startsWith(root + sep) ? full : null;
  };
  const list = (p: string) => {
    const full = inside(p);
    if (!full) return [];
    try { return readdirSync(full, { withFileTypes: true }); } catch { return []; }
  };
  return {
    root: async () => list(".").filter((e) => e.name !== ".git").map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" as const : "file" as const })),
    names: async (d) => new Set(list(d).map((e) => e.name.toLowerCase())),
    text: async (p) => {
      const full = inside(p);
      if (!full) return null;
      try {
        const st = statSync(full);
        if (!st.isFile()) return null;
        return readFileSync(full).subarray(0, MAX_BYTES).toString("utf8");
      } catch { return null; }
    },
  };
}

type Git = (args: string[]) => string | null;

/** Runs git in `cwd` and returns stdout, or null on failure. Arguments are passed as an array: never through a shell. */
export const gitIn = (cwd: string): Git => (args) => {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 4 * MAX_BYTES, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; }
};

/** One commit's files, read with git (the base branch of a pull request). Reads only; changes nothing in the checkout. */
export function gitTree(git: Git, sha: string): RepoTree {
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) throw new Error("not a commit id");
  const ls = (dir: string) => {
    const spec = dir === "." ? sha : `${sha}:${dir}`;
    const out = git(["ls-tree", spec]);
    if (out == null) return [];
    // "<mode> <type> <object>\t<name>"
    return out.split("\n").filter(Boolean).map((line) => {
      const [meta, name] = line.split("\t") as [string, string];
      return { name, type: meta.split(" ")[1] === "tree" ? "dir" as const : "file" as const };
    });
  };
  return {
    root: async () => ls("."),
    names: async (d) => new Set(ls(d).map((e) => e.name.toLowerCase())),
    text: async (p) => {
      if (p.includes("..")) return null;
      const size = Number(git(["cat-file", "-s", `${sha}:${p}`])?.trim());
      if (!Number.isFinite(size)) return null;
      const out = git(["show", `${sha}:${p}`]);
      return out == null ? null : out.slice(0, MAX_BYTES);
    },
  };
}

/** Makes sure a commit is available locally (a shallow checkout may not have the base). Returns whether it is. */
export function ensureCommit(git: Git, sha: string): boolean {
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) return false;
  if (git(["cat-file", "-e", `${sha}^{commit}`]) != null) return true;
  git(["fetch", "--no-tags", "--depth=1", "origin", sha]);
  return git(["cat-file", "-e", `${sha}^{commit}`]) != null;
}

