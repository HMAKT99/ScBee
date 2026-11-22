import type { PublicAgent, IndexedRow, Store } from "./store.js";
import { esc, layout } from "./html.js";
import { entryDestination } from "./indexer.js";
import { wrapData } from "./envelope.js";

/**
 * Need pages (/for/<slug>): one page per thing an agent or person wants done, answering it with the verified agents
 * and index entries that do it. The registry has no categories or tags, so the needs are a curated list, each with a
 * short plain answer of its own and precise matching rules: an entry counts only if every term group appears in its
 * name, description, tools or card. A page is published (indexable, in the sitemap) only with at least
 * MIN_ENTRIES real entries; at most MAX_PAGES are published; needs whose entries mostly overlap collapse into one.
 */
export const MIN_ENTRIES = 3;
export const MAX_PAGES = 100;

export interface Need { slug: string; title: string; answer: string; must: string[][] }

/** "Read PDF files" style titles: what someone types when they need it. `must`: every group needs one of its words. */
export const NEEDS: Need[] = [
  { slug: "read-pdf-files", title: "Read PDF files", must: [["pdf"], ["read", "reads", "reader", "extract", "extracts", "parse", "parses", "parser", "ocr", "text from"]], answer: "To let an agent read PDF files, give it a tool that extracts the text (and often tables and images) from a PDF so the model can work with it. Some run locally on files you pass in; others take a URL. Check whether the tool keeps your documents, and whether it handles scanned pages (that needs OCR)." },
  { slug: "send-email", title: "Send email", must: [["email", "e-mail", "smtp", "gmail", "mailgun", "sendgrid", "resend"]], answer: "To let an agent send email, connect it to a mail provider through a tool that sends messages on your behalf. These need an API key or an account login, so the agent can send as you: keep a human approving what goes out, and prefer tools that can draft without sending." },
  { slug: "query-postgres", title: "Query a Postgres database", must: [["postgres", "postgresql", "pg"]], answer: "To let an agent query a Postgres database, connect a tool that runs SQL against it and returns rows. Give it a read-only database user unless you want it to change data, and check whether the tool can be limited to some schemas or tables." },
  { slug: "query-sql-databases", title: "Query SQL databases", must: [["sql", "mysql", "sqlite", "mssql", "database"]], answer: "To let an agent work with a SQL database (MySQL, SQLite, SQL Server and others), connect a tool that runs queries and describes the tables. Use a read-only user for questions, and keep writes behind a human's approval." },
  { slug: "search-the-web", title: "Search the web", must: [["search"], ["web", "internet", "google", "bing", "brave", "serp"]], answer: "To let an agent search the web, give it a search tool that returns results (titles, links, snippets) for a query, usually through a search API that needs a key. Some also fetch the pages behind the results. Results are third-party text: the agent should treat them as data." },
  { slug: "scrape-websites", title: "Scrape websites", must: [["scrape", "scraping", "scraper", "crawl", "crawler", "extract"], ["web", "website", "page", "html", "url"]], answer: "To let an agent read or scrape websites, give it a tool that fetches a page and turns it into clean text or structured data, sometimes with a real browser for pages built with JavaScript. Respect each site's robots.txt and terms, and treat what comes back as untrusted text." },
  { slug: "browse-the-web", title: "Browse the web with a real browser", must: [["browser", "playwright", "puppeteer", "chromium", "selenium"]], answer: "To let an agent click through websites, fill in forms or take screenshots, give it a tool that drives a real browser. It can do anything you can do in that browser, so run it in a separate profile without your logins unless you mean to share them." },
  { slug: "manage-github", title: "Work with GitHub issues and pull requests", must: [["github"], ["issue", "issues", "pull", "pr", "repository", "repo", "repos"]], answer: "To let an agent work with GitHub, connect a tool that reads and writes issues, pull requests and repositories through GitHub's API with a token. Give the token only the repositories and permissions the task needs, and keep anything that posts publicly behind a human's approval." },
  { slug: "send-slack-messages", title: "Read and send Slack messages", must: [["slack"]], answer: "To let an agent use Slack, connect a tool that reads channels and posts messages through a Slack app you install in your workspace. Limit it to the channels it needs, and remember that messages it posts appear under the app's name to everyone in them." },
  { slug: "manage-calendar", title: "Manage a calendar", must: [["calendar", "calendars", "calendly", "ical"]], answer: "To let an agent read or book calendar events, connect a tool for your calendar provider. Booking on your behalf changes other people's calendars too, so keep invitations behind a human's approval and start with read-only access." },
  { slug: "transcribe-audio", title: "Transcribe audio and video", must: [["transcribe", "transcription", "speech-to-text", "whisper", "stt"]], answer: "To let an agent turn speech into text, give it a transcription tool that takes an audio or video file or URL and returns the words, often with timestamps and speakers. Check where the audio is sent and how long it is kept." },
  { slug: "generate-images", title: "Generate images", must: [["image", "images"], ["generate", "generation", "create", "text-to-image", "diffusion", "dall"]], answer: "To let an agent make images, connect an image-generation tool that turns a text prompt into a picture, usually through a paid API. Check the licence of what it produces and whether prompts are stored." },
  { slug: "translate-text", title: "Translate text", must: [["translate", "translation", "translator", "deepl"]], answer: "To let an agent translate documents or text into other languages, give it a translation tool, from dedicated translation APIs to tools that keep the original formatting. For anything published, have a fluent person check the result." },
  { slug: "read-google-drive", title: "Read Google Drive and Docs", must: [["google"], ["drive", "docs", "sheets", "workspace"]], answer: "To let an agent read or edit Google Drive files, Docs and Sheets, connect a tool that signs in to your Google account with limited scopes. Prefer read-only scopes, and share only the folders the task needs." },
  { slug: "work-with-spreadsheets", title: "Work with spreadsheets", must: [["spreadsheet", "spreadsheets", "excel", "xlsx", "csv", "sheets"]], answer: "To let an agent read, analyse or fill in spreadsheets, give it a tool that opens Excel, CSV or online sheets and reads or writes cells and tables. For files you care about, have it write a copy rather than change the original." },
  { slug: "manage-notion", title: "Read and write Notion pages", must: [["notion"]], answer: "To let an agent work in Notion, connect a tool that reads and edits pages and databases through a Notion integration you add to your workspace. Share only the pages it needs with that integration." },
  { slug: "manage-jira-linear", title: "Manage Jira or Linear tickets", must: [["jira", "linear", "atlassian"]], answer: "To let an agent read and update tickets in Jira or Linear, connect a tool that uses their API with your token. Start with reading and commenting, and let a person approve status changes and assignments." },
  { slug: "query-analytics", title: "Query product analytics", must: [["analytics", "posthog", "mixpanel", "amplitude"]], answer: "To let an agent answer questions from your analytics, connect a tool that queries events and metrics from your analytics provider. Read-only access is enough for questions, and the answers are only as good as your event names." },
  { slug: "monitor-errors-logs", title: "Read error reports and logs", must: [["sentry", "logging", "observability", "datadog", "grafana", "error tracking", "log search"]], answer: "To let an agent investigate errors, connect a tool that reads error reports and logs from your monitoring service. Logs can contain personal data and secrets, so limit what it can read and where the answers go." },
  { slug: "deploy-apps", title: "Deploy apps", must: [["deploy", "deployment", "deployments", "hosting", "vercel", "netlify", "cloudflare"]], answer: "To let an agent deploy or inspect deployments, connect a tool for your hosting provider. Deploying to production is hard to undo, so keep it behind a human's approval and let the agent use previews freely." },
  { slug: "manage-cloud-aws", title: "Manage AWS resources", must: [["aws", "amazon web services", "s3", "lambda", "ec2"]], answer: "To let an agent inspect or manage AWS, connect a tool that calls AWS APIs with credentials you give it. Use a role limited to the services and actions the task needs; deleting resources should always need a human's approval." },
  { slug: "manage-kubernetes", title: "Manage Kubernetes clusters", must: [["kubernetes", "k8s", "kubectl", "helm"]], answer: "To let an agent look into or change a Kubernetes cluster, connect a tool that talks to the cluster's API with a limited service account. Reading is low risk; applying or deleting resources should need a human's approval." },
  { slug: "run-code-sandbox", title: "Run code in a sandbox", must: [["sandbox", "sandboxed", "execute", "execution", "interpreter", "run code"]], answer: "To let an agent run code safely, give it a sandbox: an isolated environment where it can execute code and see the output without touching your machine. Check what the sandbox can reach on the network and how long it keeps files." },
  { slug: "read-documentation", title: "Look up library documentation", must: [["documentation", "docs"], ["library", "libraries", "api", "framework", "sdk", "package"]], answer: "To help an agent write correct code against a library, give it a tool that fetches up-to-date documentation and examples for a given library and version, instead of relying on what the model remembers." },
  { slug: "manage-files", title: "Read and write local files", must: [["file", "files", "filesystem"], ["read", "write", "local", "directory", "folder"]], answer: "To let an agent read and write files on a machine, give it a filesystem tool limited to the folders the task needs. Anything outside those folders, and anything you have not backed up, should stay out of reach." },
  { slug: "use-git", title: "Use git", must: [["git"]], answer: "To let an agent use git (status, diffs, commits, branches), give it a git tool on a working copy. Committing is easy to undo; pushing, force-pushing and deleting branches are not, so keep those behind a human's approval." },
  { slug: "take-notes-memory", title: "Give an agent long-term memory", must: [["memory", "long-term memory", "remember", "knowledge graph"]], answer: "To let an agent remember things between conversations, give it a memory tool that stores and retrieves notes or facts. Decide what it may store, where that lives, and how you can see and delete it." },
  { slug: "search-vector-database", title: "Search a vector database", must: [["vector", "embedding", "embeddings", "pinecone", "qdrant", "weaviate", "chroma", "rag"]], answer: "To let an agent search your own documents by meaning, connect a tool for a vector database that stores embeddings and returns the closest passages. Results are only as current as what you indexed." },
  { slug: "process-payments", title: "Work with payments", must: [["stripe", "payment", "payments", "invoice", "invoices", "billing"]], answer: "To let an agent look up customers, invoices or payments, connect a tool for your payment provider. Moving money and refunds cannot be undone, so use a restricted key and keep anything that charges or refunds behind a human's approval." },
  { slug: "manage-crm", title: "Work with a CRM", must: [["crm", "salesforce", "hubspot", "pipedrive"]], answer: "To let an agent read or update customer records, connect a tool for your CRM with a limited user. Bulk edits and anything that emails customers should need a human's approval." },
  { slug: "read-maps-places", title: "Look up maps and places", must: [["map", "maps", "geocoding", "geocode", "directions", "openstreetmap"]], answer: "To let an agent look up addresses, places, directions or distances, connect a maps tool, usually through a maps API with a key. Check the provider's terms on storing the results." },
  { slug: "get-weather", title: "Get weather forecasts", must: [["weather", "forecast", "forecasts"]], answer: "To let an agent answer weather questions, give it a weather tool that returns current conditions and forecasts for a place. Most need an API key; some public services do not." },
  { slug: "get-financial-data", title: "Get stock and market data", must: [["stock", "stocks", "market data", "stock market", "crypto prices"]], answer: "To let an agent look up prices and financial data, connect a market-data tool. Data may be delayed or licensed for personal use only; it is information, not advice." },
  { slug: "edit-video", title: "Edit or process video", must: [["video", "videos"], ["edit", "editing", "process", "convert", "ffmpeg", "clip"]], answer: "To let an agent cut, convert or process video, give it a video tool (often built on ffmpeg) that works on files you pass in. Video is large: check where files are uploaded and how long they are kept." },
  { slug: "design-figma", title: "Work with Figma designs", must: [["figma"]], answer: "To let an agent read or change Figma designs, connect a Figma tool with access to the files it needs. Reading design details for code is low risk; editing shared files is best done on a copy." },
  { slug: "test-web-apps", title: "Test web apps", must: [["test", "testing", "tests", "qa", "e2e"], ["web", "browser", "app", "playwright", "ui"]], answer: "To let an agent test a web app, give it a tool that drives a browser through user flows and reports what broke, or that runs your existing test suite. Point it at a test or staging environment, not production." },
  { slug: "check-security", title: "Scan code and dependencies for security issues", must: [["security", "vulnerability", "vulnerabilities", "cve", "secrets", "sast"]], answer: "To let an agent look for security problems, connect a scanning tool for code, dependencies or leaked secrets. Treat findings as leads to check, not verdicts, and keep reports private until they are fixed." },
  { slug: "rehearse-risky-actions", title: "Rehearse risky actions before running them", must: [["dry run", "dry-run", "rehearse", "simulate", "destructive"]], answer: "Before an agent deletes data, force-pushes or changes production, it can ask a tool to rehearse the action and report what would happen. That turns 'are you sure?' into a concrete list of effects a person can approve or stop." },
  { slug: "find-mcp-servers", title: "Find MCP servers and agents", must: [["registry", "directory", "discover", "discovery", "marketplace"], ["mcp", "agent", "agents", "server", "servers", "tools"]], answer: "To find an MCP server or agent for a task, use a directory that lets you search by what tools do, not just by name. Check who publishes each one, what it can access, and whether its owner has verified it." },
  { slug: "check-launch-readiness", title: "Check whether a project is ready to launch", must: [["launch", "readiness", "ready to launch", "pre-launch"]], answer: "Before launching a project, check what a stranger sees first: a one-line summary, a one-line install, a licence, releases, a security policy, and whether agents can find and use it. A fixed checklist with a fix for each gap is faster than guessing." },
];

/** What an entry says about itself: name, title and description. Tool lists are long and generic, so they are shown but never decide membership. */
const textOfEntry = (r: IndexedRow) => `${r.key.replace(/[./_-]/g, " ")} ${r.title ?? ""} ${r.description}`.toLowerCase();
const nameOfEntry = (r: IndexedRow) => `${r.key.replace(/[./_-]/g, " ")} ${r.title ?? ""}`.toLowerCase();
const textOfAgent = (a: PublicAgent) => `${a.name} ${a.handle} ${a.tagline ?? ""} ${a.description ?? ""} ${a.skills.map((s) => `${s.name} ${s.description ?? ""}`).join(" ")} ${a.tags.join(" ")}`.toLowerCase();
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
const fits = (text: string, n: Need) => n.must.every((g) => g.some((t) => has(text, t)));
/** The words of a need's term that matched, for a specific reason ("mentions PDF"). */
const matchedTerms = (text: string, n: Need) => n.must.map((g) => g.find((t) => has(text, t))).filter(Boolean) as string[];

export interface NeedResult { need: Need; agents: PublicAgent[]; entries: IndexedRow[]; /** Entries before the page's cap of 30. */ total?: number }

/** The verified agents and index entries that do one need. Agents first; entries need somewhere to send people. */
export async function resolveNeed(store: Store, n: Need, agents?: PublicAgent[]): Promise<NeedResult> {
  const all = agents ?? (await store.list("", true, 500));
  const words = [...new Set(n.must.flat().flatMap((t) => t.split(" ")))].filter((w) => w.length >= 2);
  const entries = (await store.indexedCandidates(words.slice(0, 8))).filter((r) => fits(textOfEntry(r), n) && entryDestination(r));
  // entries named after the need first (their name or title has one of its terms), then the rest; stable by id
  const named = (r: IndexedRow) => n.must.flat().some((term) => has(nameOfEntry(r), term));
  entries.sort((a, b) => Number(named(b)) - Number(named(a)) || a.id - b.id);
  return { need: n, agents: all.filter((a) => a.verified && fits(textOfAgent(a), n)), entries: entries.slice(0, 30), total: entries.length };
}
export const entryCount = (r: NeedResult) => r.agents.length + (r.total ?? r.entries.length);

/**
 * Which needs get a published page: at least MIN_ENTRIES real entries, at most MAX_PAGES, unmet demand first. Two needs
 * whose entries mostly overlap (two thirds or more of the smaller one) are one need: the larger page is canonical.
 * Stored daily by the cron (index_state "need_pages") so sitemaps and pages do not recompute everything.
 */
export async function qualifyNeeds(store: Store) {
  const agents = await store.list("", true, 500);
  const demand = new Set((await store.unmetDemand().catch(() => [] as { word: string }[])).map((d: { word: string }) => d.word.toLowerCase()));
  const results = await Promise.all(NEEDS.map((n) => resolveNeed(store, n, agents)));
  const ids = (r: NeedResult) => new Set([...r.agents.map((a) => `a:${a.handle}`), ...r.entries.map((e) => `e:${e.id}`)]);
  const wanted = (r: NeedResult) => r.need.must.flat().some((t) => demand.has(t));
  const ok = results.filter((r) => entryCount(r) >= MIN_ENTRIES).sort((a, b) => Number(wanted(b)) - Number(wanted(a)) || entryCount(b) - entryCount(a));
  const pages: { slug: string; count: number }[] = [];
  const canonical: Record<string, string> = {};
  for (const r of ok) {
    if (pages.length >= MAX_PAGES) break;
    const mine = ids(r);
    const twin = pages.find((p) => {
      const other = ids(results.find((x) => x.need.slug === p.slug)!);
      const shared = [...mine].filter((x) => other.has(x)).length;
      return shared / Math.min(mine.size, other.size) >= 2 / 3;
    });
    if (twin) { canonical[r.need.slug] = twin.slug; continue; }
    pages.push({ slug: r.need.slug, count: entryCount(r) });
  }
  const unmetWithoutPage = [...demand].filter((w) => !NEEDS.some((n) => n.must.flat().includes(w)));
  return { pages, canonical, unmet_without_page: unmetWithoutPage.slice(0, 20) };
}

export const needPath = (slug: string) => `/for/${slug}`;

const howToStart = (r: IndexedRow) => (r.pkg ? `Install: ${r.pkg}` : r.remote ? `Remote MCP endpoint: ${r.remote}` : r.repo ? `Source: https://${r.repo}` : "See its site");
const toolNames = (r: IndexedRow) => { try { return (JSON.parse(r.tools_json ?? "[]") as { name: string }[]).map((t) => t.name).slice(0, 6); } catch { return []; } };

export function needMd(base: string, res: NeedResult, published: boolean): string {
  const n = res.need;
  const agents = res.agents.map((a) => `- ${a.name} (@${a.handle}, verified): ${a.tagline ?? a.description ?? ""}${a.install ? `. Install: ${a.install}` : ""}. ${base}/r/${a.handle}?from=for`);
  const entries = res.entries.map((r) => `- ${r.title ?? r.key} (Indexed · unclaimed): ${r.description}${toolNames(r).length ? ` Tools: ${toolNames(r).join(", ")}.` : ""} ${howToStart(r)}. ${base}/r/x/${r.id}`);
  return `# ${n.title}

${n.answer}

${published ? "" : `Fewer than ${MIN_ENTRIES} entries do this yet, so this page is not indexed by search engines.\n\n`}## Verified agents
${agents.length ? wrapData(agents.join("\n")) : "None yet."}

## From the official MCP Registry (Indexed · unclaimed)
${entries.length ? wrapData(entries.join("\n")) : "None yet."}

Not what you need? Describe it at ${base}/find. Entries come from public data and are not reviewed: check what each can access before you install it, and ask your human first.
`;
}

export function needPage(base: string, res: NeedResult, published: boolean): string {
  const n = res.need;
  const count = entryCount(res);
  const agentLis = res.agents.map((a) => `<li><a href="/r/${esc(a.handle)}?from=for"><strong>${esc(a.name)}</strong></a> <span class="badge ok">Verified</span><span class="fix">${esc(a.tagline ?? a.description ?? "")}${a.install ? ` · Install: <code>${esc(a.install)}</code>` : ""}</span></li>`).join("");
  const entryLis = res.entries.map((r) => `<li><a href="/r/x/${r.id}" rel="nofollow"><strong>${esc(r.title ?? r.key)}</strong></a> <span class="badge">Indexed · unclaimed</span><span class="fix">${esc(r.description)}${toolNames(r).length ? ` · Tools: ${esc(toolNames(r).join(", "))}` : ""} · ${esc(howToStart(r))}</span></li>`).join("");
  const ld = { "@context": "https://schema.org", "@type": "ItemList", name: `${n.title}: agents and MCP servers`, numberOfItems: count,
    itemListElement: [...res.agents.map((a) => ({ name: a.name, url: `${base}/a/${a.handle}` })), ...res.entries.map((r) => ({ name: r.title ?? r.key, url: entryDestination(r) ?? `${base}/r/x/${r.id}` }))].map((x, i) => ({ "@type": "ListItem", position: i + 1, ...x })) };
  const body = `<div class="wrap"><div class="page"><div class="label">For a need</div><h1 class="mt8">${esc(n.title)}</h1>
<p class="lead">${esc(n.answer)}</p><div class="prose">
<h2>Verified agents</h2>${agentLis ? `<ul class="items">${agentLis}</ul>` : "<p>None yet.</p>"}
<h2>From the official MCP Registry</h2><p class="note">Indexed · unclaimed: read from public data by <a href="/bot">ScBeeBot</a>, not verified, not reviewed. Check what each can access before installing it.</p>${entryLis ? `<ul class="items">${entryLis}</ul>` : "<p>None yet.</p>"}
<p>Not what you need? <a href="/find">Describe it</a>.</p></div></div></div>`;
  return layout(`${n.title}: agents and MCP servers · ScBee`, body, {
    description: `${count} agent${count === 1 ? "" : "s"} and MCP servers that can ${n.title.toLowerCase()}, with what each does and how to start.`,
    ...(published ? {} : { head: '<meta name="robots" content="noindex">' }),
    jsonld: ld,
  });
}

export function needsIndexMd(base: string, pages: { slug: string; count: number }[]): string {
  return `# Needs\n\nOne page per thing agents and people want done, each with the verified agents and MCP servers that do it. A page appears once at least ${MIN_ENTRIES} real entries do that thing.\n\n${pages.length ? pages.map((p) => `- ${NEEDS.find((n) => n.slug === p.slug)?.title ?? p.slug} (${p.count}): ${base}${needPath(p.slug)}`).join("\n") : "None yet."}\n\nSomething missing? ${base}/find\n`;
}

export function needsIndexPage(base: string, pages: { slug: string; count: number }[]): string {
  const items = pages.map((p) => `<li><a href="${needPath(p.slug)}"><strong>${esc(NEEDS.find((n) => n.slug === p.slug)?.title ?? p.slug)}</strong></a><span class="fix">${p.count} agents and MCP servers</span></li>`).join("");
  const body = `<div class="wrap"><div class="page"><div class="label">Needs</div><h1 class="mt8">What do you need done?</h1>
<p class="lead">One page per need, each with the verified agents and MCP servers that do it. A page appears once at least ${MIN_ENTRIES} real entries do that thing.</p><div class="prose">
${items ? `<ul class="items">${items}</ul>` : "<p>None yet.</p>"}<p>Something missing? <a href="/find">Describe it</a>.</p></div></div></div>`;
  return layout("Needs · ScBee", body, { description: "Agents and MCP servers grouped by what they do: read PDFs, send email, query a database, search the web and more." });
}

/**
 * Up to 3 alternatives to a project's own index entry: other entries on the same need page, each with the specific
 * term it was matched on. Nothing when the project is not in the index or no need fits it.
 */
export async function alternativesFor(store: Store, projectKey: string): Promise<{ name: string; href: string; reason: string }[]> {
  const mine = await store.indexedForProject(projectKey);
  if (!mine.length) return [];
  const own = new Set(mine.map((m) => m.id));
  const out: { name: string; href: string; reason: string }[] = [];
  for (const n of NEEDS) {
    if (!mine.some((m) => fits(textOfEntry(m), n))) continue;
    const res = await resolveNeed(store, n, []);
    for (const r of res.entries) {
      if (own.has(r.id) || out.some((o) => o.href === `/r/x/${r.id}`)) continue;
      out.push({ name: r.title ?? r.key, href: `/r/x/${r.id}`, reason: `Also ${n.title.charAt(0).toLowerCase()}${n.title.slice(1)} (matched on "${matchedTerms(textOfEntry(r), n).join(`", "`)}").` });
      if (out.length >= 3) return out;
    }
  }
  return out;
}
