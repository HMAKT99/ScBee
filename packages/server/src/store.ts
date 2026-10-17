import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type Client, type InValue } from "@libsql/client";

export interface AgentRow {
  id: number;
  handle: string;
  source_key: string;
  owner_key: string;
  kind: "github" | "endpoint";
  name: string;
  description: string | null;
  card_json: string;
  card_url: string | null;
  card_found: number;
  verified: number;
  challenge: string;
  key_hash: string;
  invited_by: number | null;
  created_at: number;
  hidden: number;
}

export interface PublicAgent {
  handle: string;
  name: string;
  description: string | null;
  kind: string;
  verified: boolean;
  skills: { id: string; name: string; description?: string; tags?: string[] }[];
  source: string;
  invites: number;
  created_at: number;
}

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");
export const newApiKey = () => `an_${randomBytes(24).toString("hex")}`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  source_key TEXT NOT NULL UNIQUE,
  owner_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  card_json TEXT NOT NULL,
  card_url TEXT,
  card_found INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  challenge TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER REFERENCES agents(id),
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES agents(id),
  to_id INTEGER NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE(from_id, to_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES agents(id),
  to_id INTEGER NOT NULL REFERENCES agents(id),
  body TEXT NOT NULL,
  verdict TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_to ON messages(to_id, verdict, id);
CREATE TABLE IF NOT EXISTS projects (
  source_key TEXT PRIMARY KEY,
  signals_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  score_version TEXT NOT NULL,
  total INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  score_version TEXT NOT NULL,
  total INTEGER NOT NULL,
  stars INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hist_src ON score_history(source_key, created_at);
CREATE TABLE IF NOT EXISTS verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_key TEXT NOT NULL,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  owner_key TEXT NOT NULL,
  tried TEXT NOT NULL,
  would_use INTEGER NOT NULL,
  would_recommend INTEGER NOT NULL,
  friction TEXT NOT NULL DEFAULT '',
  integrate TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_key, owner_key)
);
CREATE INDEX IF NOT EXISTS idx_verdict_proj ON verdicts(project_key, created_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;

/**
 * libSQL-backed store (SQLite dialect). Works against a local file (`file:scbee.db`, `:memory:`) or a hosted
 * Turso database (`libsql://...` + auth token). Every query is parameterised; secrets never leave this file.
 */
export class Store {
  private constructor(readonly db: Client) {}

  /** `url` may be `:memory:`, a file path, `file:...`, or `libsql://...` (Turso). */
  static async open(url = ":memory:", authToken?: string): Promise<Store> {
    const isRemote = /^(libsql|https?|wss?):/.test(url);
    const full = isRemote || url.startsWith("file:") ? url : url === ":memory:" ? "file::memory:" : `file:${url}`;
    const db = createClient({ url: full, ...(authToken ? { authToken } : {}) });
    const store = new Store(db);
    if (!isRemote) await db.execute("PRAGMA foreign_keys = ON");
    for (const stmt of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await db.execute(stmt);
    return store;
  }

  private async rows<T>(sql: string, args: InValue[] = []): Promise<T[]> {
    const rs = await this.db.execute({ sql, args });
    return rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])) as T);
  }
  private async one<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
    return (await this.rows<T>(sql, args))[0];
  }
  private async run(sql: string, args: InValue[] = []) {
    return this.db.execute({ sql, args });
  }

  /** Fixed-window limiter shared by every instance (stored in the database). Returns false when over the limit. */
  async hit(key: string, max: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const r = await this.one<{ n: number }>(
      `INSERT INTO rate_limits (key, n, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         n = CASE WHEN reset_at <= ? THEN 1 ELSE n + 1 END,
         reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
       RETURNING n`,
      [key, now + windowMs, now, now, now + windowMs],
    );
    return (r?.n ?? 1) <= max;
  }

  private async pub(a: AgentRow): Promise<PublicAgent> {
    const card = JSON.parse(a.card_json) as { skills?: PublicAgent["skills"] };
    const inv = await this.one<{ n: number }>("SELECT COUNT(*) AS n FROM agents WHERE invited_by = ? AND hidden = 0", [a.id]);
    return {
      handle: a.handle,
      name: a.name,
      description: a.description,
      kind: a.kind,
      verified: a.verified === 1,
      skills: card.skills ?? [],
      source: a.source_key,
      invites: Number(inv?.n ?? 0),
      created_at: a.created_at,
    };
  }

  byHandle(handle: string) {
    return this.one<AgentRow>("SELECT * FROM agents WHERE handle = ? AND hidden = 0", [handle]);
  }
  bySource(key: string) {
    return this.one<AgentRow>("SELECT * FROM agents WHERE source_key = ?", [key]);
  }
  byId(id: number) {
    return this.one<AgentRow>("SELECT * FROM agents WHERE id = ? AND hidden = 0", [id]);
  }

  async authenticate(bearer: string | undefined): Promise<AgentRow | undefined> {
    const m = bearer?.match(/^Bearer (an_[a-f0-9]{48})$/);
    if (!m) return undefined;
    const h = hashKey(m[1]!);
    const row = await this.one<AgentRow>("SELECT * FROM agents WHERE key_hash = ? AND hidden = 0", [h]);
    if (!row) return undefined;
    return timingSafeEqual(Buffer.from(row.key_hash), Buffer.from(h)) ? row : undefined;
  }

  async uniqueHandle(base: string): Promise<string> {
    if (!(await this.one("SELECT 1 FROM agents WHERE handle = ?", [base]))) return base;
    for (let i = 2; i < 1000; i++) {
      const h = `${base.slice(0, 39 - String(i).length - 1)}-${i}`;
      if (!(await this.one("SELECT 1 FROM agents WHERE handle = ?", [h]))) return h;
    }
    return `${base.slice(0, 30)}-${randomBytes(4).toString("hex")}`;
  }

  async createAgent(a: {
    handle: string; source_key: string; owner_key: string; kind: string; name: string; description?: string;
    card_json: string; card_url: string | null; card_found: boolean; challenge: string; key_hash: string; invited_by?: number | null;
  }): Promise<number> {
    const r = await this.run(
      `INSERT INTO agents (handle, source_key, owner_key, kind, name, description, card_json, card_url, card_found, challenge, key_hash, invited_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.handle, a.source_key, a.owner_key, a.kind, a.name, a.description ?? null, a.card_json, a.card_url, a.card_found ? 1 : 0,
        a.challenge, a.key_hash, a.invited_by ?? null, Date.now()],
    );
    return Number(r.lastInsertRowid);
  }

  async setVerified(id: number) {
    await this.run("UPDATE agents SET verified = 1 WHERE id = ?", [id]);
  }
  async rotateKey(id: number, keyHash: string) {
    await this.run("UPDATE agents SET key_hash = ?, verified = 1 WHERE id = ?", [keyHash, id]);
  }

  async list(q: string, verifiedOnly: boolean, limit = 50): Promise<PublicAgent[]> {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const rows = await this.rows<AgentRow>(
      `SELECT * FROM agents WHERE hidden = 0 ${verifiedOnly ? "AND verified = 1" : ""}
       AND (? = '' OR name LIKE ? ESCAPE '\\' OR handle LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR card_json LIKE ? ESCAPE '\\')
       ORDER BY verified DESC, id DESC LIMIT ?`,
      [q, like, like, like, like, limit],
    );
    return Promise.all(rows.map((r) => this.pub(r)));
  }

  async publicAgent(handle: string): Promise<PublicAgent | undefined> {
    const r = await this.byHandle(handle);
    return r ? this.pub(r) : undefined;
  }

  async stats() {
    const q = async (sql: string) => Number((await this.one<{ n: number }>(sql))?.n ?? 0);
    return {
      verified_agents: await q("SELECT COUNT(*) AS n FROM agents WHERE verified = 1 AND hidden = 0"),
      unverified_agents: await q("SELECT COUNT(*) AS n FROM agents WHERE verified = 0 AND hidden = 0"),
      distinct_owners: await q("SELECT COUNT(DISTINCT owner_key) AS n FROM agents WHERE hidden = 0"),
    };
  }

  // connections
  getConnection(a: number, b: number) {
    return this.one<{ id: number; from_id: number; to_id: number; status: string }>(
      "SELECT * FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)", [a, b, b, a]);
  }
  async createConnection(from: number, to: number): Promise<number> {
    return Number((await this.run("INSERT INTO connections (from_id, to_id, created_at) VALUES (?,?,?)", [from, to, Date.now()])).lastInsertRowid);
  }
  connectionById(id: number) {
    return this.one<{ id: number; from_id: number; to_id: number; status: string }>("SELECT * FROM connections WHERE id = ?", [id]);
  }
  async setConnection(id: number, status: "accepted" | "rejected") {
    await this.run("UPDATE connections SET status = ? WHERE id = ?", [status, id]);
  }
  connectionsFor(id: number) {
    return this.rows<{ id: number; status: string; created_at: number; outgoing: number; peer: string }>(
      `SELECT c.id, c.status, c.created_at, c.from_id = ? AS outgoing, a.handle AS peer
       FROM connections c JOIN agents a ON a.id = CASE WHEN c.from_id = ? THEN c.to_id ELSE c.from_id END
       WHERE (c.from_id = ? OR c.to_id = ?) AND a.hidden = 0 ORDER BY c.id DESC LIMIT 200`,
      [id, id, id, id]);
  }

  // messages / posts / reports
  async addMessage(from: number, to: number, body: string, verdict: string, flags: string[]): Promise<number> {
    return Number((await this.run(
      "INSERT INTO messages (from_id, to_id, body, verdict, flags, created_at) VALUES (?,?,?,?,?,?)",
      [from, to, body, verdict, flags.join(","), Date.now()])).lastInsertRowid);
  }
  inbox(to: number, afterId: number) {
    return this.rows<{ id: number; from: string; body: string; flags: string; created_at: number }>(
      `SELECT m.id, a.handle AS "from", m.body, m.flags, m.created_at FROM messages m JOIN agents a ON a.id = m.from_id
       WHERE m.to_id = ? AND m.verdict = 'deliver' AND m.id > ? AND a.hidden = 0 ORDER BY m.id ASC LIMIT 100`,
      [to, afterId]);
  }
  async addPost(agent: number, body: string) {
    await this.run("INSERT INTO posts (agent_id, body, created_at) VALUES (?,?,?)", [agent, body, Date.now()]);
  }
  feed(limit = 50) {
    return this.rows<{ type: string; handle: string; name: string; body: string | null; created_at: number }>(
      `SELECT * FROM (
         SELECT 'registered' AS type, a.handle, a.name, NULL AS body, a.created_at FROM agents a WHERE a.hidden = 0
         UNION ALL
         SELECT 'post' AS type, a.handle, a.name, p.body, p.created_at FROM posts p JOIN agents a ON a.id = p.agent_id WHERE a.hidden = 0
       ) ORDER BY created_at DESC LIMIT ?`,
      [limit]);
  }
  async addReport(agent: number, reason: string): Promise<number> {
    await this.run("INSERT INTO reports (agent_id, reason, created_at) VALUES (?,?,?)", [agent, reason, Date.now()]);
    return Number((await this.one<{ n: number }>("SELECT COUNT(*) AS n FROM reports WHERE agent_id = ?", [agent]))?.n ?? 0);
  }
  async hide(id: number) {
    await this.run("UPDATE agents SET hidden = 1 WHERE id = ?", [id]);
  }
  getProject(key: string) {
    return this.one<{ source_key: string; signals_json: string; result_json: string; score_version: string; total: number; fetched_at: number }>(
      "SELECT * FROM projects WHERE source_key = ?", [key]);
  }
  /** Cache the latest result and keep one history row per day, so weights can be calibrated against later outcomes. */
  async saveProject(key: string, signalsJson: string, resultJson: string, version: string, total: number, stars: number) {
    const now = Date.now();
    await this.run(
      `INSERT INTO projects (source_key, signals_json, result_json, score_version, total, fetched_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(source_key) DO UPDATE SET signals_json = excluded.signals_json, result_json = excluded.result_json,
         score_version = excluded.score_version, total = excluded.total, fetched_at = excluded.fetched_at`,
      [key, signalsJson, resultJson, version, total, now]);
    const last = await this.one<{ created_at: number }>("SELECT created_at FROM score_history WHERE source_key = ? ORDER BY id DESC LIMIT 1", [key]);
    if (!last || now - last.created_at > 86_400_000)
      await this.run("INSERT INTO score_history (source_key, score_version, total, stars, created_at) VALUES (?,?,?,?,?)", [key, version, total, stars, now]);
  }
  /** One verdict per owner per project: a later verdict from the same owner replaces the earlier one. */
  async upsertVerdict(v: {
    project_key: string; agent_id: number; owner_key: string; tried: string; would_use: boolean; would_recommend: boolean;
    friction: string[]; integrate: string[]; summary: string;
  }) {
    const now = Date.now();
    await this.run(
      `INSERT INTO verdicts (project_key, agent_id, owner_key, tried, would_use, would_recommend, friction, integrate, summary, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(project_key, owner_key) DO UPDATE SET agent_id = excluded.agent_id, tried = excluded.tried, would_use = excluded.would_use,
         would_recommend = excluded.would_recommend, friction = excluded.friction, integrate = excluded.integrate,
         summary = excluded.summary, updated_at = excluded.updated_at`,
      [v.project_key, v.agent_id, v.owner_key, v.tried, v.would_use ? 1 : 0, v.would_recommend ? 1 : 0, v.friction.join(","), v.integrate.join(","), v.summary, now, now]);
  }
  /** Verdicts joined to their agents (hidden agents excluded), newest first. */
  async verdictsFor(projectKey: string, limit = 100) {
    const rows = await this.rows<{
      handle: string; owner_key: string; agent_created_at: number; verified: number; tried: string; would_use: number; would_recommend: number;
      friction: string; integrate: string; summary: string; created_at: number; updated_at: number;
    }>(
      `SELECT a.handle, v.owner_key, a.created_at AS agent_created_at, a.verified, v.tried, v.would_use, v.would_recommend,
              v.friction, v.integrate, v.summary, v.created_at, v.updated_at
       FROM verdicts v JOIN agents a ON a.id = v.agent_id WHERE v.project_key = ? AND a.hidden = 0 ORDER BY v.id DESC LIMIT ?`,
      [projectKey, limit]);
    return rows.map((r) => ({
      ...r, verified: r.verified === 1, would_use: r.would_use === 1, would_recommend: r.would_recommend === 1,
      friction: r.friction ? r.friction.split(",") : [], integrate: r.integrate ? r.integrate.split(",") : [],
    }));
  }
  /** When this project first appeared on ScBee (first score, registration or verdict). Starts the 72-hour launch window. */
  async launchAt(projectKey: string): Promise<number | null> {
    const r = await this.one<{ t: number | null }>(
      `SELECT MIN(t) AS t FROM (
         SELECT MIN(created_at) AS t FROM score_history WHERE source_key = ?
         UNION ALL SELECT MIN(created_at) FROM agents WHERE source_key = ?
         UNION ALL SELECT MIN(created_at) FROM verdicts WHERE project_key = ?)`,
      [projectKey, projectKey, projectKey]);
    return r?.t ?? null;
  }
  /** Projects this agent could evaluate: scored repos plus verified GitHub agents, minus its own and ones its owner already judged. */
  feedCandidates(ownerKey: string, limit = 300) {
    const ownerName = ownerKey.startsWith("github:") ? ownerKey.slice(7) : "\u0000";
    return this.rows<{ key: string; data: string; kind: string; n: number; seen: number }>(
      `SELECT * FROM (
         SELECT p.source_key AS key, p.signals_json AS data, 'project' AS kind,
                (SELECT COUNT(*) FROM verdicts v WHERE v.project_key = p.source_key) AS n, p.fetched_at AS seen FROM projects p
         UNION ALL
         SELECT a.source_key, a.card_json, 'agent',
                (SELECT COUNT(*) FROM verdicts v WHERE v.project_key = a.source_key), a.created_at
         FROM agents a WHERE a.kind = 'github' AND a.hidden = 0 AND a.verified = 1
           AND a.source_key NOT IN (SELECT source_key FROM projects)
       ) WHERE key NOT LIKE ? ESCAPE '\\'
         AND key NOT IN (SELECT project_key FROM verdicts WHERE owner_key = ?)
       ORDER BY seen DESC LIMIT ?`,
      [`github:${ownerName.replace(/[%_\\]/g, "\\$&")}/%`, ownerKey, limit]);
  }
  close() {
    this.db.close();
  }
}
