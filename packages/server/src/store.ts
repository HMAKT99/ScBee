import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

// Loaded via require so bundlers/test runners that strip the `node:` prefix still resolve it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = DatabaseSyncType;

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
`;

/** SQLite-backed store. Every query is parameterised; secrets never leave this file. */
export class Store {
  readonly db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  private pub(a: AgentRow): PublicAgent {
    const card = JSON.parse(a.card_json) as { skills?: PublicAgent["skills"] };
    const invites = (this.db.prepare("SELECT COUNT(*) AS n FROM agents WHERE invited_by = ? AND hidden = 0").get(a.id) as { n: number }).n;
    return {
      handle: a.handle,
      name: a.name,
      description: a.description,
      kind: a.kind,
      verified: a.verified === 1,
      skills: card.skills ?? [],
      source: a.source_key,
      invites,
      created_at: a.created_at,
    };
  }

  byHandle(handle: string): AgentRow | undefined {
    return this.db.prepare("SELECT * FROM agents WHERE handle = ? AND hidden = 0").get(handle) as AgentRow | undefined;
  }
  bySource(key: string): AgentRow | undefined {
    return this.db.prepare("SELECT * FROM agents WHERE source_key = ?").get(key) as AgentRow | undefined;
  }
  byId(id: number): AgentRow | undefined {
    return this.db.prepare("SELECT * FROM agents WHERE id = ? AND hidden = 0").get(id) as AgentRow | undefined;
  }

  authenticate(bearer: string | undefined): AgentRow | undefined {
    const m = bearer?.match(/^Bearer (an_[a-f0-9]{48})$/);
    if (!m) return undefined;
    const h = hashKey(m[1]!);
    const row = this.db.prepare("SELECT * FROM agents WHERE key_hash = ? AND hidden = 0").get(h) as AgentRow | undefined;
    if (!row) return undefined;
    return timingSafeEqual(Buffer.from(row.key_hash), Buffer.from(h)) ? row : undefined;
  }

  uniqueHandle(base: string): string {
    if (!this.db.prepare("SELECT 1 FROM agents WHERE handle = ?").get(base)) return base;
    for (let i = 2; i < 1000; i++) {
      const h = `${base.slice(0, 39 - String(i).length - 1)}-${i}`;
      if (!this.db.prepare("SELECT 1 FROM agents WHERE handle = ?").get(h)) return h;
    }
    return `${base.slice(0, 30)}-${randomBytes(4).toString("hex")}`;
  }

  createAgent(a: {
    handle: string; source_key: string; owner_key: string; kind: string; name: string; description?: string;
    card_json: string; card_url: string | null; card_found: boolean; challenge: string; key_hash: string; invited_by?: number | null;
  }): number {
    const r = this.db
      .prepare(
        `INSERT INTO agents (handle, source_key, owner_key, kind, name, description, card_json, card_url, card_found, challenge, key_hash, invited_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(a.handle, a.source_key, a.owner_key, a.kind, a.name, a.description ?? null, a.card_json, a.card_url, a.card_found ? 1 : 0,
        a.challenge, a.key_hash, a.invited_by ?? null, Date.now());
    return Number(r.lastInsertRowid);
  }

  setVerified(id: number) {
    this.db.prepare("UPDATE agents SET verified = 1 WHERE id = ?").run(id);
  }

  list(q: string, verifiedOnly: boolean, limit = 50): PublicAgent[] {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM agents WHERE hidden = 0 ${verifiedOnly ? "AND verified = 1" : ""}
         AND (? = '' OR name LIKE ? ESCAPE '\\' OR handle LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR card_json LIKE ? ESCAPE '\\')
         ORDER BY verified DESC, id DESC LIMIT ?`,
      )
      .all(q, like, like, like, like, limit) as unknown as AgentRow[];
    return rows.map((r) => this.pub(r));
  }

  publicAgent(handle: string): PublicAgent | undefined {
    const r = this.byHandle(handle);
    return r ? this.pub(r) : undefined;
  }

  stats() {
    const q = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      verified_agents: q("SELECT COUNT(*) AS n FROM agents WHERE verified = 1 AND hidden = 0"),
      unverified_agents: q("SELECT COUNT(*) AS n FROM agents WHERE verified = 0 AND hidden = 0"),
      distinct_owners: q("SELECT COUNT(DISTINCT owner_key) AS n FROM agents WHERE hidden = 0"),
    };
  }

  // connections
  getConnection(a: number, b: number) {
    return this.db
      .prepare("SELECT * FROM connections WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)")
      .get(a, b, b, a) as { id: number; from_id: number; to_id: number; status: string } | undefined;
  }
  createConnection(from: number, to: number): number {
    return Number(this.db.prepare("INSERT INTO connections (from_id, to_id, created_at) VALUES (?,?,?)").run(from, to, Date.now()).lastInsertRowid);
  }
  connectionById(id: number) {
    return this.db.prepare("SELECT * FROM connections WHERE id = ?").get(id) as { id: number; from_id: number; to_id: number; status: string } | undefined;
  }
  setConnection(id: number, status: "accepted" | "rejected") {
    this.db.prepare("UPDATE connections SET status = ? WHERE id = ?").run(status, id);
  }
  connectionsFor(id: number) {
    return this.db
      .prepare(
        `SELECT c.id, c.status, c.created_at, c.from_id = ? AS outgoing, a.handle AS peer
         FROM connections c JOIN agents a ON a.id = CASE WHEN c.from_id = ? THEN c.to_id ELSE c.from_id END
         WHERE (c.from_id = ? OR c.to_id = ?) AND a.hidden = 0 ORDER BY c.id DESC LIMIT 200`,
      )
      .all(id, id, id, id) as { id: number; status: string; created_at: number; outgoing: number; peer: string }[];
  }

  // messages / posts / reports
  addMessage(from: number, to: number, body: string, verdict: string, flags: string[]) {
    return Number(
      this.db.prepare("INSERT INTO messages (from_id, to_id, body, verdict, flags, created_at) VALUES (?,?,?,?,?,?)")
        .run(from, to, body, verdict, flags.join(","), Date.now()).lastInsertRowid,
    );
  }
  inbox(to: number, afterId: number) {
    return this.db
      .prepare(
        `SELECT m.id, a.handle AS "from", m.body, m.flags, m.created_at FROM messages m JOIN agents a ON a.id = m.from_id
         WHERE m.to_id = ? AND m.verdict = 'deliver' AND m.id > ? AND a.hidden = 0 ORDER BY m.id ASC LIMIT 100`,
      )
      .all(to, afterId) as { id: number; from: string; body: string; flags: string; created_at: number }[];
  }
  addPost(agent: number, body: string) {
    this.db.prepare("INSERT INTO posts (agent_id, body, created_at) VALUES (?,?,?)").run(agent, body, Date.now());
  }
  feed(limit = 50) {
    return this.db
      .prepare(
        `SELECT * FROM (
           SELECT 'registered' AS type, a.handle, a.name, NULL AS body, a.created_at FROM agents a WHERE a.hidden = 0
           UNION ALL
           SELECT 'post' AS type, a.handle, a.name, p.body, p.created_at FROM posts p JOIN agents a ON a.id = p.agent_id WHERE a.hidden = 0
         ) ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as { type: string; handle: string; name: string; body: string | null; created_at: number }[];
  }
  addReport(agent: number, reason: string) {
    this.db.prepare("INSERT INTO reports (agent_id, reason, created_at) VALUES (?,?,?)").run(agent, reason, Date.now());
    const n = (this.db.prepare("SELECT COUNT(DISTINCT rowid) AS n FROM reports WHERE agent_id = ?").get(agent) as { n: number }).n;
    return n;
  }
  hide(id: number) {
    this.db.prepare("UPDATE agents SET hidden = 1 WHERE id = ?").run(id);
  }
  close() {
    this.db.close();
  }
}
