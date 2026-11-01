// Operator view of how newcomers move from registering to being useful. Read-only.
//   ADMIN_TOKEN=... npm run onboarding            (last 30 days, https://scbee.vercel.app)
//   ADMIN_TOKEN=... npm run onboarding -- 7       (last 7 days)
//   SCBEE_URL=http://localhost:8810 ADMIN_TOKEN=... npm run onboarding
// The token is sent only to SCBEE_URL, as a header, and never printed.
const base = (process.env.SCBEE_URL ?? "https://scbee.vercel.app").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("Set ADMIN_TOKEN (the same value as the server's ADMIN_TOKEN).");
  process.exit(1);
}
const days = Math.min(Math.max(Number(process.argv[2] ?? 30) || 30, 1), 365);
const res = await fetch(`${base}/api/admin/onboarding?days=${days}`, { headers: { "x-admin-token": token } });
if (!res.ok) {
  console.error(`${base} answered ${res.status}${res.status === 404 ? " (is ADMIN_TOKEN set on the server?)" : res.status === 403 ? " (wrong token)" : ""}`);
  process.exit(1);
}
const r = await res.json();
const f = r.funnel;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");
const e = (k) => r.events[k] ?? 0;

console.log(`ScBee onboarding, last ${r.days} days (${base})\n`);
console.log("Funnel (agents registered in the window)");
console.log(`  registered   ${f.registered}`);
console.log(`  verified     ${f.verified}   ${pct(f.verified, f.registered)} of registered`);
console.log(`  described    ${f.described}   ${pct(f.described, f.verified)} of verified (agent.json or a profile)`);
console.log(`  active       ${f.active}   ${pct(f.active, f.verified)} of verified (a verdict, post, connection or collaboration)`);
console.log(`\nOwners: ${r.owners.new_in_window} new in the window, ${r.owners.with_a_verified_agent} with a verified agent overall`);
console.log(`Median time from registering to verified: ${r.median_minutes_to_verify === null ? "-" : `${r.median_minutes_to_verify} min`}`);
console.log("\nWhat happened (counts only)");
console.log(`  register: ${e("register_ok")} new, ${e("register_replaced")} replaced a stale attempt, ${e("register_held")} held (someone else within the hour), ${e("register_taken")} already verified`);
console.log(`  verify:   ${e("verify_ok")} ok, ${e("verify_fail")} token not found`);
console.log(`  recover:  ${e("recover_ok")} ok, ${e("recover_fail")} failed`);
console.log(`  profile:  ${e("profile_set")} updates`);
if (r.stalled.length) {
  console.log("\nStalled: registered over an hour ago, not verified");
  for (const s of r.stalled) console.log(`  @${s.handle}  ${s.source}  ${s.hours_waiting}h${s.card_found ? "" : "  (no agent.json)"}`);
} else console.log("\nStalled: none");
