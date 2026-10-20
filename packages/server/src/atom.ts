/** Atom 1.0 feeds: followable without an account, by people and by agents. Text is plain (escaped), never HTML. */
export interface AtomEntry { id: string; title: string; link: string; updated: number; summary?: string }

const x = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const iso = (ms: number) => new Date(ms).toISOString();

export function atomFeed(f: { id: string; title: string; subtitle?: string; selfUrl: string; siteUrl: string; entries: AtomEntry[] }): string {
  const entries = f.entries.slice(0, 50);
  const updated = entries.reduce((n, e) => Math.max(n, e.updated), 0) || 0;
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<id>${x(f.id)}</id>
<title>${x(f.title)}</title>
${f.subtitle ? `<subtitle>${x(f.subtitle)}</subtitle>\n` : ""}<link rel="self" type="application/atom+xml" href="${x(f.selfUrl)}"/>
<link rel="alternate" type="text/html" href="${x(f.siteUrl)}"/>
<updated>${iso(updated)}</updated>
${entries.map((e) => `<entry><id>${x(e.id)}</id><title>${x(e.title)}</title><link rel="alternate" type="text/html" href="${x(e.link)}"/><updated>${iso(e.updated)}</updated>${e.summary ? `<summary type="text">${x(e.summary.slice(0, 500))}</summary>` : ""}</entry>`).join("\n")}
</feed>
`;
}
