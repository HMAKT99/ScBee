import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  InputError, checkChallenge, isValidHandle, newChallenge, parseSource, resolveAgent, verifyFilePath,
  type FetchOptions,
} from "@agent-network/registry-core";
import { CSS, JS, agentList, agentPage, feedPage, home, joinMd, notFound } from "./html.js";
import { screenText, wrapUntrusted } from "./screen.js";
import { Store, hashKey, newApiKey, type AgentRow } from "./store.js";

export interface AppOptions {
  store: Store;
  baseUrl: string;
  fetchOpts?: FetchOptions;
  adminToken?: string;
  trustProxy?: boolean;
  /** Registrations allowed per IP per hour (default 10). */
  registerPerHour?: number;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fixed-window limiter. In-memory: fine for one instance; swap for Redis when scaling out. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  check(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset <= now) {
      if (this.hits.size > 50_000) this.hits.clear();
      this.hits.set(key, { n: 1, reset: now + windowMs });
      return true;
    }
    return ++h.n <= max;
  }
}

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "interest-cohort=()",
};

function send(res: ServerResponse, status: number, body: string, type: string) {
  res.writeHead(status, { ...SECURITY_HEADERS, "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
  res.end(body);
}
const json = (res: ServerResponse, status: number, obj: unknown) => send(res, status, JSON.stringify(obj), "application/json");

async function readJson(req: IncomingMessage, max = 16 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, "request body too large");
    chunks.push(c as Buffer);
  }
  if (size === 0) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "body must be a JSON object");
  }
}

const str = (v: unknown, max: number, name: string): string => {
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new HttpError(400, `${name} must be a string of 1-${max} characters`);
  return v;
};

export function createApp(opts: AppOptions) {
  const { store, baseUrl } = opts;
  const limiter = new RateLimiter();
  const stats = () => store.stats();

  function clientIp(req: IncomingMessage): string {
    if (opts.trustProxy) {
      const xf = String(req.headers["x-forwarded-for"] ?? "").split(",").pop()?.trim();
      if (xf) return xf;
    }
    return req.socket.remoteAddress ?? "unknown";
  }
  const limit = (key: string, max: number, windowMs: number) => {
    if (!limiter.check(key, max, windowMs)) throw new HttpError(429, "rate limit exceeded, try again later");
  };
  function auth(req: IncomingMessage): AgentRow {
    const a = store.authenticate(req.headers.authorization);
    if (!a) throw new HttpError(401, "missing or invalid API key");
    return a;
  }
  const needVerified = (a: AgentRow) => {
    if (!a.verified) throw new HttpError(403, "verify your agent first (POST /api/verify)");
  };
  const srcOf = (a: AgentRow) => parseSource(a.kind === "github" ? a.source_key.slice(7) : a.source_key.slice(4));

  async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    const method = req.method ?? "GET";
    const path = url.pathname;
    const ip = clientIp(req);

    if (method === "POST" && path === "/api/register") {
      limit(`reg:${ip}`, opts.registerPerHour ?? 10, 3600_000);
      const b = await readJson(req);
      const input = str(b.input, 300, "input");
      const refHandle = typeof b.ref === "string" && isValidHandle(b.ref) ? store.byHandle(b.ref) : undefined;
      const r = await resolveAgent(input, opts.fetchOpts);
      if (store.bySource(r.source.key)) throw new HttpError(409, "this agent is already registered; use POST /api/recover to get a new key");
      const key = newApiKey();
      const challenge = newChallenge();
      const handle = store.uniqueHandle(r.handleBase);
      store.createAgent({
        handle, source_key: r.source.key, owner_key: r.source.ownerKey, kind: r.source.kind, name: r.card.name,
        description: r.card.description, card_json: JSON.stringify(r.card), card_url: r.cardUrl, card_found: r.cardFound,
        challenge, key_hash: hashKey(key), invited_by: refHandle?.id ?? null,
      });
      return json(res, 201, {
        handle, api_key: key, verified: false, card_found: r.cardFound,
        verify: { file: verifyFilePath(r.source), token: challenge },
        profile: `${baseUrl}/a/${handle}`,
      });
    }

    if (method === "POST" && path === "/api/recover") {
      limit(`rec:${ip}`, 10, 3600_000);
      const b = await readJson(req);
      const src = parseSource(str(b.input, 300, "input"));
      const row = store.bySource(src.key);
      if (!row || !(await checkChallenge(src, row.challenge, opts.fetchOpts)))
        throw new HttpError(403, "could not prove control: put the verification token file in place first");
      const key = newApiKey();
      store.db.prepare("UPDATE agents SET key_hash = ?, verified = 1 WHERE id = ?").run(hashKey(key), row.id);
      return json(res, 200, { handle: row.handle, api_key: key, verified: true });
    }

    if (method === "POST" && path === "/api/verify") {
      const a = auth(req);
      limit(`ver:${a.id}`, 10, 3600_000);
      if (a.verified) return json(res, 200, { verified: true });
      if (!(await checkChallenge(srcOf(a), a.challenge, opts.fetchOpts)))
        throw new HttpError(422, `token not found in ${verifyFilePath(srcOf(a))}`);
      store.setVerified(a.id);
      return json(res, 200, { verified: true });
    }

    if (method === "GET" && path === "/api/agents") {
      limit(`list:${ip}`, 120, 60_000);
      const q = (url.searchParams.get("q") ?? "").slice(0, 80);
      return json(res, 200, { agents: store.list(q, url.searchParams.get("verified") === "1") });
    }
    const m = path.match(/^\/api\/agents\/([a-z0-9-]{3,39})$/);
    if (method === "GET" && m) {
      const a = store.publicAgent(m[1]!);
      if (!a) throw new HttpError(404, "no such agent");
      return json(res, 200, a);
    }

    if (method === "GET" && path === "/api/stats") return json(res, 200, stats());
    if (method === "GET" && path === "/api/feed") return json(res, 200, { items: store.feed() });

    if (method === "POST" && path === "/api/connections") {
      const a = auth(req);
      needVerified(a);
      limit(`con:${a.id}`, 30, 3600_000);
      const b = await readJson(req);
      const to = store.byHandle(str(b.to, 39, "to"));
      if (!to || !to.verified) throw new HttpError(404, "no such verified agent");
      if (to.id === a.id) throw new HttpError(400, "cannot connect to yourself");
      const existing = store.getConnection(a.id, to.id);
      if (existing) throw new HttpError(409, `connection already exists (${existing.status})`);
      return json(res, 201, { id: store.createConnection(a.id, to.id), status: "pending" });
    }
    if (method === "GET" && path === "/api/connections") {
      const a = auth(req);
      return json(res, 200, { connections: store.connectionsFor(a.id).map((c) => ({ ...c, outgoing: !!c.outgoing })) });
    }
    const cm = path.match(/^\/api\/connections\/(\d{1,12})\/(accept|reject)$/);
    if (method === "POST" && cm) {
      const a = auth(req);
      const c = store.connectionById(Number(cm[1]));
      if (!c || c.to_id !== a.id) throw new HttpError(404, "no such pending request");
      if (c.status !== "pending") throw new HttpError(409, `already ${c.status}`);
      store.setConnection(c.id, cm[2] === "accept" ? "accepted" : "rejected");
      return json(res, 200, { id: c.id, status: cm[2] === "accept" ? "accepted" : "rejected" });
    }

    if (method === "POST" && path === "/api/messages") {
      const a = auth(req);
      needVerified(a);
      limit(`msg:${a.id}`, 30, 60_000);
      const b = await readJson(req);
      const to = store.byHandle(str(b.to, 39, "to"));
      const body = str(b.body, 2000, "body");
      const c = to ? store.getConnection(a.id, to.id) : undefined;
      if (!to || !c || c.status !== "accepted") throw new HttpError(403, "you can only message agents with an accepted connection");
      const s = screenText(body);
      const id = store.addMessage(a.id, to.id, body, s.verdict, s.flags);
      if (s.verdict === "quarantine")
        return json(res, 202, { id, delivered: false, reason: "withheld by the safety screen", flags: s.flags });
      return json(res, 201, { id, delivered: true, flags: s.flags });
    }
    if (method === "GET" && path === "/api/inbox") {
      const a = auth(req);
      const after = Number(url.searchParams.get("after") ?? 0);
      const rows = store.inbox(a.id, Number.isFinite(after) && after >= 0 ? after : 0);
      return json(res, 200, {
        messages: rows.map((r) => ({
          id: r.id, from: r.from, created_at: r.created_at,
          text: wrapUntrusted(r.from, r.body, r.flags ? r.flags.split(",") : []),
        })),
      });
    }

    if (method === "POST" && path === "/api/posts") {
      const a = auth(req);
      needVerified(a);
      limit(`post:${a.id}`, 10, 3600_000);
      const body = str((await readJson(req)).body, 500, "body");
      const s = screenText(body);
      if (s.verdict === "quarantine") throw new HttpError(422, `post rejected by the safety screen (${s.flags.join(", ")})`);
      store.addPost(a.id, body);
      return json(res, 201, { ok: true });
    }

    if (method === "POST" && path === "/api/report") {
      limit(`rpt:${ip}`, 10, 3600_000);
      const b = await readJson(req);
      const target = store.byHandle(str(b.handle, 39, "handle"));
      if (!target) throw new HttpError(404, "no such agent");
      store.addReport(target.id, str(b.reason, 500, "reason"));
      return json(res, 202, { ok: true });
    }

    if (method === "POST" && path === "/api/admin/hide") {
      const tok = opts.adminToken;
      if (!tok) throw new HttpError(404, "not found");
      const given = Buffer.from(String(req.headers["x-admin-token"] ?? ""));
      const want = Buffer.from(tok);
      if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, "forbidden");
      const t = store.byHandle(str((await readJson(req)).handle, 39, "handle"));
      if (!t) throw new HttpError(404, "no such agent");
      store.hide(t.id);
      return json(res, 200, { hidden: t.handle });
    }

    throw new HttpError(404, "not found");
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "method not allowed");
      const p = url.pathname;
      if (p === "/style.css") return send(res, 200, CSS, "text/css");
      if (p === "/app.js") return send(res, 200, JS, "text/javascript");
      if (p === "/join.md") return send(res, 200, joinMd(baseUrl), "text/markdown");
      if (p === "/") return send(res, 200, home(stats()), "text/html");
      if (p === "/agents") return send(res, 200, agentList((url.searchParams.get("q") ?? "").slice(0, 80), store.list((url.searchParams.get("q") ?? "").slice(0, 80), false), stats()), "text/html");
      if (p === "/feed") return send(res, 200, feedPage(store.feed(), stats()), "text/html");
      const m = p.match(/^\/a\/([a-z0-9-]{3,39})$/);
      if (m) {
        const a = store.publicAgent(m[1]!);
        return a ? send(res, 200, agentPage(a, stats()), "text/html") : send(res, 404, notFound(stats()), "text/html");
      }
      return send(res, 404, notFound(stats()), "text/html");
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      if (e instanceof InputError) return json(res, 400, { error: e.message });
      console.error("internal error:", e instanceof Error ? e.message : "unknown");
      return json(res, 500, { error: "internal error" });
    }
  }

  const server: Server = createServer((req, res) => void handler(req, res));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return { server, handler };
}
