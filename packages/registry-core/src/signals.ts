/** Facts about a public project, gathered once and scored deterministically. README text is analysed, never stored or rendered. */

export interface ReadmeFacts {
  present: boolean;
  headings: number;
  codeBlocks: number;
  hasInstallCommand: boolean;
  /** Where the first install command sits, as a fraction of the README (0 = top). */
  installPosition: number | null;
  hasUsageExample: boolean;
  hasMedia: boolean;
  hasSummary: boolean;
  envVars: number;
}

export interface ProjectSignals {
  source: string;
  /** Canonical owner/repo casing from GitHub, for display. */
  fullName?: string;
  description: string | null;
  topics: string[];
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  createdAt: string | null;
  pushedAt: string | null;
  archived: boolean;
  hasCi: boolean;
  hasSecurityPolicy: boolean;
  hasRelease: boolean;
  runtimeDeclared: boolean;
  hasAgentCard: boolean;
  listedOnScbee: boolean;
  verifiedOnScbee: boolean;
  readme: ReadmeFacts;
}

const INSTALL =
  /\b(npm\s+(i|install|add)\b|npx\s+\S|pnpm\s+(add|dlx|i|install)\b|yarn\s+(add|dlx)\b|bunx?\s+\S|pip3?\s+install\b|pipx\s+(install|run)\b|uvx?\s+(add|pip|tool|run)\b|brew\s+install\b|cargo\s+(install|add)\b|go\s+(install|get)\b|docker\s+(run|pull|compose\s+up)\b|gem\s+install\b|composer\s+require\b|dotnet\s+(add|tool)\b|curl\s[^\n]*\|\s*(ba)?sh)/i;
const USAGE_HEADING = /^#{1,6}\s*.*\b(usage|example|examples|quick\s?start|getting started|how to use|demo|tutorial)\b/im;
const MEDIA = /(!\[[^\]]*\]\([^)]+\)|<img\s|\.(gif|mp4|webm|mov)\b|youtu\.?be|loom\.com|asciinema\.org|vimeo\.com)/i;
const ENV = /\b[A-Z][A-Z0-9]*_(?:API_KEY|KEY|TOKEN|SECRET|PASSWORD|URL|DSN)\b/g;

/** Remove things a reader would not see (and an attacker might use to game the score). */
function visible(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[​-‏⁠﻿]/g, "");
}

export function analyseReadme(raw: string | null): ReadmeFacts {
  if (raw === null || raw.trim().length === 0)
    return { present: false, headings: 0, codeBlocks: 0, hasInstallCommand: false, installPosition: null, hasUsageExample: false, hasMedia: false, hasSummary: false, envVars: 0 };
  const md = visible(raw);
  const blocks = [...md.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  const inline = [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
  const codeText = [...blocks.map((b) => b[1]!), ...inline];
  let installPosition: number | null = null;
  for (const b of blocks) {
    if (INSTALL.test(b[1]!)) {
      installPosition = (b.index ?? 0) / Math.max(md.length, 1);
      break;
    }
  }
  const inlineInstall = inline.some((c) => INSTALL.test(c));
  const hasInstallCommand = installPosition !== null || inlineInstall;
  if (installPosition === null && inlineInstall) installPosition = 0.5;

  // first real prose paragraph: skip headings, badges, images, html, code
  const prose = md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p.length >= 30 && !/^(#|!\[|\[!\[|<|```|\||-{3,}|\*{3,})/.test(p) && /[a-z]{3,}.*\s.*[a-z]{3,}/i.test(p));

  return {
    present: true,
    headings: (md.match(/^#{1,6}\s+\S/gm) ?? []).length,
    codeBlocks: blocks.length,
    hasInstallCommand,
    installPosition,
    hasUsageExample: blocks.length >= 2 || (USAGE_HEADING.test(md) && blocks.length >= 1),
    hasMedia: MEDIA.test(md),
    hasSummary: !!prose,
    envVars: new Set(codeText.join("\n").match(ENV) ?? []).size || new Set(md.match(ENV) ?? []).size,
  };
}
