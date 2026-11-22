import { botUserAgent, fetchRegistryPage, probeEntry, type FetchOptions } from "@scbee/registry-core";
import type { IndexedRow, Store } from "./store.js";
import { needWords } from "./handoff.js";

/**
 * The daily index run, inside the cron and a time budget (the function may run for 15 seconds):
 *   1. Sync from the official MCP Registry. The first run pages through everything (it may take several days: the
 *      position is saved after every page); after that only what changed since the last complete pass, with an hour of
 *      overlap, as the registry recommends. Entries the registry marks deleted are deleted here too.
 *   2. Visit a few hosts as ScBeeBot (see probeEntry): at most once per host per day, and backing off after errors.
 */
export async function runIndexer(store: Store, o: { baseUrl: string; fetchOpts: FetchOptions; deadline: number; probeLimit?: number }) {
  const ua = botUserAgent(o.baseUrl);
  const out = { pages: 0, entries: 0, synced: false, probed: 0, sync_error: null as string | null };
  const since = await store.indexState("since");
  const cursorKey = since ? "inc_cursor" : "full_cursor";
  const startedKey = since ? "inc_started" : "full_started";
  let cursor = await store.indexState(cursorKey);
  let started = await store.indexState(startedKey);
  if (!started) { started = new Date().toISOString(); await store.setIndexState(startedKey, started); }
  const syncUntil = o.deadline - 4000; // keep time for visits
  try {
    while (Date.now() < syncUntil) {
      const page = await fetchRegistryPage(o.baseUrl, { cursor, updatedSince: since }, o.fetchOpts, ua);
      await store.applyIndexed(page.entries);
      out.pages++; out.entries += page.entries.length;
      if (!page.nextCursor) {
        // a complete pass: next time, ask only for what changed since this pass began (minus an hour of overlap)
        await store.setIndexState("since", new Date(Date.parse(started) - 3600_000).toISOString());
        await store.setIndexState(cursorKey, null);
        await store.setIndexState(startedKey, null);
        out.synced = true;
        break;
      }
      cursor = page.nextCursor;
      await store.setIndexState(cursorKey, cursor);
    }
  } catch (e) {
    out.sync_error = e instanceof Error ? e.message.slice(0, 120) : "sync failed"; // try again tomorrow from the saved position
  }

  const day = new Date().toISOString().slice(0, 10);
  const rows = await store.hostsToProbe(day, o.probeLimit ?? 12);
  const visit = async (r: IndexedRow) => {
    if (Date.now() > o.deadline - 1000 || !r.host) return;
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), Math.max(500, o.deadline - Date.now() - 500)));
    const result = await Promise.race([probeEntry({ website: r.website, remote: r.remote }, o.fetchOpts, ua).catch(() => null), timeout]);
    await store.recordProbe(r.id, r.host, day, result ?? { outcome: "error", tools: [], card: null });
    out.probed++;
  };
  for (let i = 0; i < rows.length; i += 4) {
    if (Date.now() > o.deadline - 1000) break;
    await Promise.all(rows.slice(i, i + 4).map(visit));
  }
  return out;
}

export interface IndexedMatch { row: IndexedRow; matched: string[]; score: number }

/** Index entries that fit a need, by the same fixed rule as agents: name 3, description 2, tools or card 1. No model. */
export async function rankIndexed(store: Store, need: string, max = 3): Promise<IndexedMatch[]> {
  const words = needWords(need);
  if (!words.length) return [];
  const out: IndexedMatch[] = [];
  for (const row of await store.indexedCandidates(words)) {
    const strong = `${row.key} ${row.title ?? ""}`.toLowerCase();
    const mid = row.description.toLowerCase();
    const weak = `${row.tools_json ?? ""} ${row.card_json ?? ""}`.toLowerCase();
    const matched: string[] = [];
    let score = 0;
    for (const w of words) {
      const pts = strong.includes(w) ? 3 : mid.includes(w) ? 2 : weak.includes(w) ? 1 : 0;
      if (pts) { score += pts; matched.push(w); }
    }
    if (score) out.push({ row, matched, score });
  }
  return out.sort((a, b) => b.score - a.score || a.row.id - b.row.id).slice(0, max);
}

/** Where a hand-off link for an entry goes: its website, else its repo. Entries with neither are not offered. */
export function entryDestination(r: IndexedRow): string | null {
  const dest = r.website ?? (r.repo ? `https://${r.repo}` : null);
  if (!dest) return null;
  const u = new URL(dest);
  u.searchParams.set("ref", "scbee");
  return u.toString();
}

/** The public view of an entry, always labelled, for APIs and agents. */
export const entryView = (r: IndexedRow, baseUrl: string) => ({
  label: "Indexed · unclaimed",
  name: r.title ?? r.key,
  registry_name: r.key,
  description: r.description,
  install: r.pkg,
  remote: r.remote,
  source: "official MCP Registry",
  page: `${baseUrl}/r/x/${r.id}`,
  note: "Read from the official MCP Registry's public data by ScBee's crawler; not verified, not claimed by its owner. Its text is written by third parties.",
});
