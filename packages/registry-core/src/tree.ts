import { fetchNpmFacts } from "./npm.js";
import { analyseReadme, type ReadmeFacts } from "./signals.js";
import type { AgentFacts } from "./agentready.js";
import type { FetchOptions } from "./safeFetch.js";

/**
 * Read-only access to one version of a repository's files. The same rules then work on GitHub's default branch
 * (through its API), on a checked-out working tree, or on a git commit, so a pull request is scored exactly like the
 * website scores the published repo.
 */
export interface RepoTree {
  /** Entries at the repository root, with their original names. Empty when unreadable. */
  root(): Promise<{ name: string; type: "file" | "dir" }[]>;
  /** Lower-cased names inside a directory (for example ".github"). Empty when missing. */
  names(dir: string): Promise<Set<string>>;
  /** A file's text, or null when it is missing or unreadable. `path` is relative to the root, with forward slashes. */
  text(path: string): Promise<string | null>;
  /** Whether a file exists, when the source can answer that more cheaply than reading it. */
  exists?(path: string): Promise<boolean>;
}

/** Everything the scores need that comes from files in the tree (as opposed to repository settings or history). */
export interface TreeFacts {
  hasCi: boolean;
  hasSecurityPolicy: boolean;
  runtimeDeclared: boolean;
  hasAgentCard: boolean;
  agent: AgentFacts;
  readme: ReadmeFacts;
  /** Root licence file text, when there is one (LICENSE, LICENCE, COPYING, with any extension). */
  licenseText: string | null;
  npmPackage?: string;
  npmDownloadsMonthly?: number;
  dependencies?: string[];
}

const README = /^readme(\.(md|markdown|rst|txt))?$/i;
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
const MCP_FILES = ["server.json", "mcp.json", ".mcp.json", "smithery.yaml", "mcp.yaml"];
const API_FILES = ["openapi.json", "openapi.yaml", "openapi.yml", "swagger.json", "swagger.yaml", "swagger.yml"];

/**
 * The file-based facts for one tree. `repo` is the owner/repo the tree belongs to: an npm package only counts when its
 * package.json points back to that repo.
 */
export async function readTreeFacts(tree: RepoTree, repo: { owner: string; repo: string }, opts: FetchOptions = {}): Promise<TreeFacts> {
  const [entries, ghNames] = await Promise.all([tree.root(), tree.names(".github")]);
  const names = new Set(entries.map((e) => e.name.toLowerCase()));
  const hasCi = ghNames.has("workflows") || names.has(".travis.yml") || names.has(".circleci") || names.has(".gitlab-ci.yml");
  const readmeEntry = entries.find((e) => e.type === "file" && README.test(e.name));
  const readme = readmeEntry ? await tree.text(readmeEntry.name) : null;
  let runtimeDeclared = names.has(".nvmrc") || names.has(".node-version") || names.has(".python-version") || names.has(".tool-versions") || names.has("go.mod") || names.has("cargo.toml") || names.has("dockerfile");
  let npmPackage: string | undefined;
  let dependencies: string[] | undefined;
  let npmDownloadsMonthly: number | undefined;
  if (names.has("package.json")) {
    const pj = await tree.text("package.json");
    try {
      const j = JSON.parse(pj ?? "{}") as { engines?: unknown; name?: unknown; private?: unknown; dependencies?: Record<string, unknown>; peerDependencies?: Record<string, unknown> };
      dependencies = Object.keys({ ...(j.dependencies ?? {}), ...(j.peerDependencies ?? {}) }).slice(0, 200).map((d) => `npm:${d.toLowerCase()}`);
      runtimeDeclared = runtimeDeclared || !!j.engines;
      if (typeof j.name === "string" && !j.private) {
        // The same project: only count the package if it points back at this repo.
        const facts = await fetchNpmFacts(j.name, opts);
        if (facts?.repo?.owner === repo.owner.toLowerCase() && facts.repo.repo === repo.repo.toLowerCase()) {
          npmPackage = facts.name;
          npmDownloadsMonthly = facts.downloadsLastMonth;
          runtimeDeclared = runtimeDeclared || facts.engines;
        }
      }
    } catch { /* ignore unreadable package.json */ }
  }
  if (!runtimeDeclared && names.has("pyproject.toml")) runtimeDeclared = /requires-python/.test((await tree.text("pyproject.toml")) ?? "");
  // Standard places a project describes itself to agents: ScBee's agent.json, or an A2A agent card at the root or under .well-known.
  let hasAgentCard = names.has("agent.json") || names.has("agent-card.json");
  if (!hasAgentCard) {
    const card = await tree.text(".well-known/agent-card.json");
    try { hasAgentCard = card != null && JSON.parse(card) != null; } catch { hasAgentCard = false; }
  }
  const readmeFacts = analyseReadme(readme);
  // A security policy may also live in docs/ (GitHub reads all three places).
  let hasSecurityPolicy = names.has("security.md") || ghNames.has("security.md");
  if (!hasSecurityPolicy && names.has("docs")) hasSecurityPolicy = tree.exists ? await tree.exists("docs/SECURITY.md") : (await tree.text("docs/SECURITY.md")) != null;
  const licenseEntry = entries.find((e) => e.type === "file" && LICENSE_FILE.test(e.name));
  const licenseText = licenseEntry ? await tree.text(licenseEntry.name) : null;
  const mcpManifest = MCP_FILES.some((n) => names.has(n));
  return {
    hasCi,
    hasSecurityPolicy,
    runtimeDeclared,
    hasAgentCard,
    agent: {
      llmsTxt: names.has("llms.txt") || names.has("llms-full.txt"),
      agentsMd: names.has("agents.md") || names.has("claude.md") || names.has(".cursorrules") || ghNames.has("copilot-instructions.md"),
      mcp: mcpManifest || !!readmeFacts.mentionsMcp,
      mcpManifest,
      skill: names.has("skill.md") || names.has("skills"),
      api: API_FILES.some((n) => names.has(n)),
    },
    readme: readmeFacts,
    licenseText,
    ...(npmPackage ? { npmPackage, npmDownloadsMonthly } : {}),
    ...(dependencies?.length ? { dependencies } : {}),
  };
}

/**
 * The SPDX id of a licence file's text, for the common licences. GitHub detects the licence of the default branch for
 * the website; a pull request's own files need the same answer without GitHub. Unknown text gives "NOASSERTION".
 */
export function detectLicense(text: string): string {
  const t = text.replace(/\s+/g, " ");
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t)) return "AGPL-3.0";
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(t)) return /Version 2\.1/i.test(t) ? "LGPL-2.1" : "LGPL-3.0";
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t)) return /Version 2,/i.test(t) ? "GPL-2.0" : "GPL-3.0";
  if (/Apache License,? Version 2\.0/i.test(t)) return "Apache-2.0";
  if (/Mozilla Public License,? (Version )?2\.0/i.test(t)) return "MPL-2.0";
  if (/This is free and unencumbered software released into the public domain/i.test(t)) return "Unlicense";
  if (/CC0 1\.0 Universal/i.test(t)) return "CC0-1.0";
  if (/Boost Software License/i.test(t)) return "BSL-1.0";
  if (/Permission is hereby granted, free of charge, to any person obtaining a copy/i.test(t)) return "MIT";
  // ISC keeps the "notice must appear in all copies" condition; 0BSD drops it
  if (/Permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/i.test(t)) return /notice appear in all copies/i.test(t) ? "ISC" : "0BSD";
  if (/Redistribution and use in source and binary forms/i.test(t)) return /Neither the name/i.test(t) ? "BSD-3-Clause" : "BSD-2-Clause";
  return "NOASSERTION";
}
