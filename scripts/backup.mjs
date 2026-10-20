// Read-only backup of the ScBee database to a local JSON file.
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/backup.mjs [outDir]
// Only runs SELECTs. Skips `kv` (cached tokens), `rate_limits` (disposable) and `secrets` (the signing key). The output holds hashed keys and
// private data, so it is written with mode 600 and must stay off GitHub (backups/ is git-ignored).
import { createClient } from "@libsql/client";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) { console.error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) first."); process.exit(1); }
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN });
const SKIP = new Set(["kv", "rate_limits", "secrets"]);

const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' ORDER BY name"))
  .rows.map((r) => String(r.name)).filter((n) => !SKIP.has(n));

const dump = { taken_at: new Date().toISOString(), tables: {} };
for (const t of tables) {
  const rs = await db.execute(`SELECT * FROM "${t.replace(/"/g, '""')}"`);
  dump.tables[t] = rs.rows.map((row) => Object.fromEntries(rs.columns.map((c, i) => [c, typeof row[i] === "bigint" ? Number(row[i]) : row[i]])));
}

const dir = process.argv[2] ?? "backups";
mkdirSync(dir, { recursive: true });
const file = join(dir, `scbee-${dump.taken_at.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(dump, null, 2), { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`Backed up ${tables.length} tables to ${file}`);
for (const t of tables) console.log(`  ${t.padEnd(16)} ${dump.tables[t].length} rows`);
