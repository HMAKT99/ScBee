/**
 * The constellation: how projects relate. Every edge carries a weight and a human-readable reason.
 * Deterministic rules only (manifests, README mentions, a small category table, topic overlap, agent verdicts).
 */

export type EdgeType = "DEPENDS_ON" | "COMPOSES_WITH" | "ALTERNATIVE_TO" | "ENDORSED_BY";

export interface GraphNode {
  key: string;           // github:owner/repo
  name: string;          // owner/repo for display
  description: string;
  topics: string[];
  npmPackage?: string;
  dependencies: string[]; // npm:name
  mentions: string[];     // github:o/r | npm:name | pypi:name
  score?: number;
}
export interface Endorsement { from: string; to: string; owners: number }
export interface GraphEdge {
  type: EdgeType;
  from: string;          // always the center, or the dependent for DEPENDS_ON
  to: string;
  weight: number;        // 0..1
  reason: string;
}

interface Category { id: string; label: string; words: string[] }
const CATEGORIES: Category[] = [
  { id: "auth", label: "authentication", words: ["auth", "authentication", "oauth", "oauth2", "login", "sso", "jwt", "passkey", "passkeys", "oidc"] },
  { id: "web", label: "web frameworks", words: ["nextjs", "next.js", "react", "express", "fastify", "django", "flask", "rails", "nuxt", "svelte", "sveltekit", "framework", "webapp"] },
  { id: "scraper", label: "scraping", words: ["scraper", "scraping", "crawler", "crawl", "crawling", "spider"] },
  { id: "vector", label: "vector search", words: ["vector", "embeddings", "pgvector", "qdrant", "chroma", "chromadb", "rag", "semantic-search"] },
  { id: "mcp", label: "MCP", words: ["mcp", "model-context-protocol", "mcp-server"] },
  { id: "agent", label: "AI agents", words: ["agent", "agents", "ai-agent", "ai-agents", "langchain", "llm-agent", "autogen", "crewai", "agentic"] },
  { id: "observability", label: "observability", words: ["observability", "tracing", "monitoring", "telemetry", "logging", "opentelemetry"] },
  { id: "testing", label: "testing or evals", words: ["testing", "evals", "evaluation", "benchmark", "test-framework"] },
  { id: "safety", label: "safety tooling", words: ["guardrails", "safety", "sandbox", "security", "policy", "red-team"] },
  { id: "database", label: "databases", words: ["database", "sql", "postgres", "postgresql", "sqlite", "orm", "mysql"] },
  { id: "payments", label: "payments", words: ["stripe", "payments", "billing", "checkout"] },
  { id: "deploy", label: "deployment", words: ["deploy", "deployment", "docker", "hosting", "serverless", "kubernetes"] },
];
/** Pairs that genuinely need each other. Order does not matter. */
const COMPLEMENTS: [string, string, string][] = [
  ["auth", "web", "web apps need sign-in"],
  ["scraper", "vector", "scraped content needs somewhere to be indexed"],
  ["mcp", "agent", "agents call MCP servers for tools"],
  ["agent", "observability", "agents need tracing to debug"],
  ["agent", "safety", "agents need guardrails before they act"],
  ["agent", "vector", "agents use vector stores for memory"],
  ["agent", "testing", "agents need evals before launch"],
  ["web", "database", "web apps need a database"],
  ["web", "payments", "web apps need payments"],
  ["web", "deploy", "web apps need somewhere to run"],
  ["mcp", "safety", "MCP tools need guardrails"],
];

const words = (n: GraphNode) => new Set(`${n.description} ${n.topics.join(" ")} ${n.name}`.toLowerCase().split(/[^a-z0-9.+#-]+/).filter(Boolean));
export function categoriesOf(n: GraphNode): string[] {
  const w = words(n);
  const topics = new Set(n.topics.map((t) => t.toLowerCase()));
  return CATEGORIES.filter((c) => c.words.some((x) => topics.has(x) || w.has(x))).map((c) => c.id);
}
const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a.map((x) => x.toLowerCase())), B = new Set(b.map((x) => x.toLowerCase()));
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}

/** Edges between `center` and every other node, strongest first. */
export function buildEdges(center: GraphNode, others: GraphNode[], endorsements: Endorsement[] = [], opts: { max?: number; maxAlternatives?: number } = {}): GraphEdge[] {
  const max = opts.max ?? 12, maxAlt = opts.maxAlternatives ?? 2;
  const edges: GraphEdge[] = [];
  const cCats = categoriesOf(center);
  const cNames = new Set([`github:${center.key.slice(7)}`, ...(center.npmPackage ? [`npm:${center.npmPackage}`] : [])]);

  for (const o of others) {
    if (o.key === center.key) continue;
    const oIds = new Set([o.key, ...(o.npmPackage ? [`npm:${o.npmPackage}`] : [])]);
    const found: GraphEdge[] = [];

    const cDepO = center.dependencies.find((d) => oIds.has(d));
    if (cDepO) found.push({ type: "DEPENDS_ON", from: center.key, to: o.key, weight: 1, reason: `${center.name} depends on ${o.name} (${cDepO.replace(/^npm:/, "")}).` });
    const oDepC = o.dependencies.find((d) => cNames.has(d));
    if (oDepC) found.push({ type: "DEPENDS_ON", from: o.key, to: center.key, weight: 1, reason: `${o.name} depends on ${center.name}.` });

    if (center.mentions.some((m) => oIds.has(m))) found.push({ type: "COMPOSES_WITH", from: center.key, to: o.key, weight: 0.8, reason: `${center.name}'s README mentions ${o.name}.` });
    else if (o.mentions.some((m) => cNames.has(m))) found.push({ type: "COMPOSES_WITH", from: center.key, to: o.key, weight: 0.8, reason: `${o.name}'s README mentions ${center.name}.` });

    const oCats = categoriesOf(o);
    let composed = false;
    for (const [a, b, why] of COMPLEMENTS) {
      if ((cCats.includes(a) && oCats.includes(b)) || (cCats.includes(b) && oCats.includes(a))) {
        const mine = cCats.includes(a) && oCats.includes(b) ? a : b;
        const theirs = mine === a ? b : a;
        found.push({ type: "COMPOSES_WITH", from: center.key, to: o.key, weight: 0.5, reason: `${center.name} relates to ${label(mine)} and ${o.name} relates to ${label(theirs)}: ${why}.` });
        composed = true;
        break;
      }
    }

    const shared = center.topics.filter((t) => o.topics.map((x) => x.toLowerCase()).includes(t.toLowerCase()));
    const sim = jaccard(center.topics, o.topics);
    if (!composed && sim >= 0.6 && shared.length >= 2 && cCats.some((c) => oCats.includes(c)))
      found.push({ type: "ALTERNATIVE_TO", from: center.key, to: o.key, weight: 0.3, reason: `Covers the same ground: shares topics ${shared.slice(0, 4).join(", ")}.` });

    const end = endorsements.filter((e) => (e.from === center.key && e.to === o.key) || (e.from === o.key && e.to === center.key));
    const owners = end.reduce((n, e) => n + e.owners, 0);
    if (owners > 0) found.push({ type: "ENDORSED_BY", from: center.key, to: o.key, weight: Math.min(1, 0.4 + 0.2 * owners), reason: `${owners} independent agent owner${owners === 1 ? "" : "s"} said they would integrate these two.` });

    // keep the strongest edge per type for this pair, drop duplicates
    const best = new Map<EdgeType, GraphEdge>();
    for (const e of found) if (!best.has(e.type) || best.get(e.type)!.weight < e.weight) best.set(e.type, e);
    edges.push(...best.values());
  }

  const rank = (e: GraphEdge) => e.weight;
  const sorted = edges.sort((a, b) => rank(b) - rank(a) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type));
  const out: GraphEdge[] = [];
  let alts = 0;
  for (const e of sorted) {
    if (out.length >= max) break;
    if (e.type === "ALTERNATIVE_TO") { if (alts >= maxAlt) continue; alts++; }
    out.push(e);
  }
  return out;
}
