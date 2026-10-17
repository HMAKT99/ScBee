#!/usr/bin/env node
import { createApp } from "./app.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT ?? 8787);
const baseUrl = (process.env.BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
const store = await Store.open(process.env.DATABASE_URL ?? process.env.DB_PATH ?? "scbee.db", process.env.DATABASE_AUTH_TOKEN);
const { server } = createApp({
  store,
  baseUrl,
  adminToken: process.env.ADMIN_TOKEN || undefined,
  trustProxy: process.env.TRUST_PROXY === "1",
  githubToken: process.env.GITHUB_TOKEN || undefined,
  cronSecret: process.env.CRON_SECRET || undefined,
  webhookKey: process.env.WEBHOOK_KEY || undefined,
});
server.listen(port, () => console.log(`scbee listening on ${baseUrl} (port ${port})`));
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => server.close(() => { store.close(); process.exit(0); }));
