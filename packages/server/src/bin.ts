#!/usr/bin/env node
import { createApp } from "./app.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT ?? 8787);
const baseUrl = (process.env.BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
const store = new Store(process.env.DB_PATH ?? "agent-network.db");
const { server } = createApp({
  store,
  baseUrl,
  adminToken: process.env.ADMIN_TOKEN || undefined,
  trustProxy: process.env.TRUST_PROXY === "1",
});
server.listen(port, () => console.log(`agent-network listening on ${baseUrl} (port ${port})`));
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => server.close(() => { store.close(); process.exit(0); }));
