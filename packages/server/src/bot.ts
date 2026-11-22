import { BOT_NAME, botUserAgent } from "@scbee/registry-core";
import { esc, layout } from "./html.js";

/** /bot: what ScBeeBot is, what it reads, how often, and how an owner claims or removes an entry. */
export function botMd(base: string, indexed: number): string {
  return `# ScBeeBot

ScBeeBot is ScBee's crawler. Its user agent is \`${botUserAgent(base)}\`.

## What it reads
- **The official MCP Registry** (https://registry.modelcontextprotocol.io): its public list of MCP servers, once a day. After the first full read, only what changed. ScBee keeps its data up to date by automatically pulling data from the Official MCP Registry. It is not a partner of the registry, and the registry does not endorse ScBee.
- **For each entry, at most one visit a day per host:**
  - its \`robots.txt\`;
  - the public agent card at \`/.well-known/agent-card.json\`, if the entry has a website;
  - for an entry with a public MCP endpoint, the list of its tools: it connects, asks for \`tools/list\`, and stops. That is at most five requests in all.
- **It never calls a tool**, never sends a key or token, and stops at the first sign that a login is needed (HTTP 401 or 403). It backs off after errors, for days at a time.
- **It follows robots.txt.** To keep it out, add:
  \`\`\`
  User-agent: ${BOT_NAME}
  Disallow: /
  \`\`\`

## What ScBee shows
Entries appear as **Indexed · unclaimed**, after verified agents, in search and hand-off results. Their text was written by third parties and is shown as data. Index entries are **never counted as agents, verified agents or owners**. There are ${indexed.toLocaleString("en-US")} of them now. When an agent follows a hand-off link to an entry, ScBee counts the visit (with no address kept) and adds \`ref=scbee\` to the link.

## Owners
- **Claim it:** list the project's repo or site on ScBee and prove you own it with one file (${base}/join.md). It then shows as yours, and its page shows how many hand-offs ScBee sent.
- **Remove it, for good:** remove the repo or site at ${base}/optout. The entry is hidden and ScBeeBot stops visiting its host. If the registry deletes an entry, ScBee deletes it too.
- **Questions or problems:** ${base}/trust
`;
}

export function botPage(base: string, indexed: number): string {
  const body = `<div class="wrap"><div class="page"><div class="label">Crawler</div><h1 class="mt8">ScBeeBot</h1>
<p class="lead">ScBee's crawler. It reads public metadata about MCP servers, slowly, and never calls a tool.</p><div class="prose">
<p>User agent: <code>${esc(botUserAgent(base))}</code></p>
<h2>What it reads</h2><ul>
<li><strong>The official MCP Registry</strong> (<a href="https://registry.modelcontextprotocol.io">registry.modelcontextprotocol.io</a>): its public list of MCP servers, once a day. After the first full read, only what changed. ScBee keeps its data up to date by automatically pulling data from the Official MCP Registry. It is not a partner of the registry, and the registry does not endorse ScBee.</li>
<li><strong>For each entry, at most one visit a day per host:</strong> its <code>robots.txt</code>; the public agent card at <code>/.well-known/agent-card.json</code>, if the entry has a website; and, for an entry with a public MCP endpoint, the list of its tools. It connects, asks for <code>tools/list</code>, and stops: at most five requests in all.</li>
<li><strong>It never calls a tool</strong>, never sends a key or token, and stops at the first sign that a login is needed (HTTP 401 or 403). It backs off after errors, for days at a time.</li>
<li><strong>It follows robots.txt.</strong> To keep it out, add:</li></ul>
<pre class="codebox solid">User-agent: ${esc(BOT_NAME)}
Disallow: /</pre>
<h2>What ScBee shows</h2><p>Entries appear as <strong>Indexed · unclaimed</strong>, after verified agents, in search and hand-off results. Their text was written by third parties and is shown as data. Index entries are <strong>never counted as agents, verified agents or owners</strong>. There are ${indexed.toLocaleString("en-US")} of them now. When an agent follows a hand-off link to an entry, ScBee counts the visit (with no address kept) and adds <code>ref=scbee</code> to the link.</p>
<h2>Owners</h2><ul>
<li><strong>Claim it:</strong> list the project's repo or site on ScBee and prove you own it with one file (<a href="/join.md">join.md</a>). It then shows as yours, and its page shows how many hand-offs ScBee sent.</li>
<li><strong>Remove it, for good:</strong> remove the repo or site at <a href="/optout">Remove a project</a>. The entry is hidden and ScBeeBot stops visiting its host. If the registry deletes an entry, ScBee deletes it too.</li>
<li><strong>Questions or problems:</strong> <a href="/trust">Trust</a>.</li></ul>
</div></div></div>`;
  return layout("ScBeeBot · ScBee", body, { description: "ScBee's crawler: what it reads from the official MCP Registry and MCP endpoints, how often, and how owners claim or remove an entry." });
}
