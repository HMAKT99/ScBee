// Operator view of who is arriving, by class (human, AI crawler, agent client, ScBee itself, unknown). Read-only.
//   ADMIN_TOKEN=... npm run traffic            (last 30 days, https://scbee.vercel.app)
//   ADMIN_TOKEN=... npm run traffic -- 7       (last 7 days)
//   SCBEE_URL=http://localhost:8810 ADMIN_TOKEN=... npm run traffic
// The token is sent only to SCBEE_URL, as a header, and never printed. Edge-cached pages never reach the server,
// so every number here is a floor.
const base = (process.env.SCBEE_URL ?? "https://scbee.vercel.app").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("Set ADMIN_TOKEN (the same value as the server's ADMIN_TOKEN).");
  process.exit(1);
}
const days = Math.min(Math.max(Number(process.argv[2] ?? 30) || 30, 1), 90);
const res = await fetch(`${base}/api/admin/traffic?days=${days}`, { headers: { "x-admin-token": token } });
if (!res.ok) {
  console.error(`${base} answered ${res.status}${res.status === 404 ? " (is ADMIN_TOKEN set on the server?)" : res.status === 403 ? " (wrong token)" : ""}`);
  process.exit(1);
}
const r = await res.json();
const CLASSES = ["human", "ai_crawler", "agent_client", "scbee_self", "unknown"];
const sum = (rows, f) => rows.filter(f).reduce((n, x) => n + x.n, 0);
const pad = (s, n) => String(s).padEnd(n);
const num = (s, n = 8) => String(s).padStart(n);

console.log(`ScBee traffic since ${r.since} (${base}). Requests that reached the server; cached pages are not counted.\n`);
console.log(`${pad("class", 14)}${num("requests")}${num("callers", 10)}${num("mcp callers", 13)}`);
for (const c of CLASSES) {
  const reqs = sum(r.daily, (x) => x.class === c);
  // distinct callers summed over days: a caller seen on two days counts twice (days cannot be joined, by design)
  const callers = sum(r.distinct, (x) => x.class === c && x.scope === "all");
  const mcp = sum(r.distinct, (x) => x.class === c && x.scope === "mcp");
  console.log(`${pad(c, 14)}${num(reqs)}${num(callers, 10)}${num(mcp, 13)}`);
}
console.log("\n(callers = distinct callers per day, added up over the days: the same caller on two days counts twice.)");

const groups = [...new Set(r.daily.map((x) => x.grp))].sort();
console.log(`\nBy page group${" ".repeat(2)}${CLASSES.map((c) => num(c.replace("_", " "), 13)).join("")}`);
for (const g of groups) console.log(`${pad(g, 15)}${CLASSES.map((c) => num(sum(r.daily, (x) => x.grp === g && x.class === c), 13)).join("")}`);

const daysSeen = [...new Set(r.daily.map((x) => x.day))].sort();
console.log("\nPer day (requests)");
console.log(`${pad("day", 12)}${CLASSES.map((c) => num(c.replace("_", " "), 13)).join("")}`);
for (const d of daysSeen) console.log(`${pad(d, 12)}${CLASSES.map((c) => num(sum(r.daily, (x) => x.day === d && x.class === c), 13)).join("")}`);

const tools = {};
for (const t of r.tools) tools[t.tool] = (tools[t.tool] ?? 0) + t.n;
console.log("\nHosted MCP (/mcp) calls per tool");
for (const [t, n] of Object.entries(tools).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(t, 26)}${num(n)}`);
if (!Object.keys(tools).length) console.log("  none yet");
