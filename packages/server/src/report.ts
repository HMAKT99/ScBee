import type { AgentReadyReport, MissingFile } from "@scbee/registry-core";
import { esc, layout } from "./html.js";
import { wrapData } from "./envelope.js";

const enc = encodeURIComponent;

export function reportPage(r: AgentReadyReport, base: string): string {
  const text = r.n ? `Of ${r.n} new projects ScBee scored, ${r.checks[0]!.pct}% pass "${r.checks[0]!.label}" and the average Agent-Ready score is ${r.avgAgentReady}/100.` : "State of agent-readiness";
  const url = `${base}/report`;
  const body = `<div class="wrap"><div class="page"><div class="label">Report</div><h1 class="mt8">State of agent-readiness.</h1>
<p class="lead">How ready are new open-source projects for agents to find, install and trust? Totals only, from public files, by fixed rules. No project is named and nothing here is a verdict on any one of them.</p>
${r.n ? `<div class="specimen"><p><strong>${r.n}</strong> projects from the Index &middot; average launch readiness <strong>${r.avgReadiness}/100</strong> &middot; average Agent-Ready <strong>${r.avgAgentReady}/100</strong></p></div>
<h2 class="h2s">What is missing most often</h2>
<ul class="rows">${r.checks.map((c) => `<li><div><div class="nm">${esc(c.label)}</div></div><div><div class="tg">${c.pct}% of projects pass</div><div class="meta mt8">${c.passing} of ${r.n}</div></div><div></div></li>`).join("")}</ul>
<p class="note mt16">The Index holds the newest projects in a few categories (MCP servers, agent skills, A2A agents, reverse-engineering tools and more), so this describes them, not all of GitHub. Projects scored before these checks existed are left out, not guessed.</p>
<h2 class="h2s">Share it</h2><div class="share"><a class="btn sm" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}">Post on X</a>
<a class="btn sm" rel="noopener" href="https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}">Post on Bluesky</a>
<button class="btn ghost sm" data-copy="${esc(url)}">Copy link</button></div>`
    : `<div class="card center"><p><strong>Nothing to report yet.</strong></p><p class="mute">The report appears once the Index has scored projects. You can score any repo from the home page.</p></div>`}
<p class="mt24">Check your own project: <a href="/">paste a link on the home page</a>.</p></div></div>`;
  return layout("State of agent-readiness · ScBee", body, { description: "How ready new open-source projects are for agents to find, install and trust. Totals only, by fixed rules." });
}

export function reportMd(base: string, r: AgentReadyReport): string {
  return `# State of agent-readiness

Totals only, from public files, by fixed rules. No project is named. API: GET ${base}/api/report

${r.n ? `Projects: ${r.n}. Average launch readiness: ${r.avgReadiness}/100. Average Agent-Ready: ${r.avgAgentReady}/100.\n\nMost often missing first:\n${r.checks.map((c) => `- ${c.label}: ${c.pct}% pass (${c.passing} of ${r.n})`).join("\n")}\n\nThis describes the Index (newest projects in a few categories), not all of GitHub.` : "Nothing to report yet."}
`;
}

export function fixPage(path: string, name: string, files: MissingFile[], base: string): string {
  const body = `<div class="wrap"><div class="page"><div class="label">Fix it</div><h1 class="mt8">${esc(name)}: files to add.</h1>
<p class="lead">Starting points for the files agents look for, made by fixed templates from public facts. Anything only you know is marked TODO. Read each one, edit it, then add it to your ${path.startsWith("web/") ? "site" : "repo"} yourself. ScBee never changes your ${path.startsWith("web/") ? "site" : "repo"}.</p>
${files.length ? files.map((f) => `<h2 class="h2s">${esc(f.file)}</h2><p class="mute">${esc(f.why)}${f.at ? ` ${f.at.startsWith("/") ? "Serve it at" : "Add it to"} <code>${esc(f.at)}</code>.` : ""}</p>
<div class="use"><pre style="margin:0;white-space:pre-wrap;overflow:auto;max-width:100%">${esc(f.content)}</pre><button class="btn sm" data-copy="${esc(f.content)}">Copy</button></div>`).join("")
    : `<div class="card center"><p><strong>Nothing to generate.</strong></p><p class="mute">The files these checks look for are already there.</p></div>`}
<p class="mt24"><a href="/${esc(path)}">Back to the score</a></p></div></div>`;
  return layout(`Files to add for ${name} · ScBee`, body, { head: '<meta name="robots" content="noindex,follow">', description: "Starting points for the files agents look for, made by fixed templates. Nothing is changed in your repo." });
}

export function fixMd(base: string, path: string, name: string, files: MissingFile[]): string {
  // The templates carry the project's own description, which is third-party text: everything goes inside the envelope.
  return `# Files to add: ${path}

Starting points made by fixed templates from public facts. TODO marks what only the owner knows. ScBee never changes your repo or site.
Score: ${base}/${path}

${files.length ? wrapData(files.map((f) => `--- ${f.file}${f.at ? ` at ${f.at}` : ""} (${f.why})\n${f.content}`).join("\n")) : "Nothing to generate: the files these checks look for are already there."}
`;
}
