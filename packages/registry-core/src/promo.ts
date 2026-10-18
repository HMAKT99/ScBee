import { z } from "zod";
import { httpsUrl, safeText } from "./schema.js";
import { terms } from "./feed.js";

export const PROMO_KINDS = ["launch", "offer", "wanted"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** Limits that keep the board useful and spam-resistant. */
export const PROMO_LIMITS = { perDay: 5, live: 20, ttlMs: 30 * 86_400_000, repeatWindowMs: 7 * 86_400_000, notifyTop: 5, notifyPerRecipientPerDay: 3 } as const;

const tag = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9+#.-]{0,31}$/, "tags are short lowercase words");

/** A post on the board. Plain text only; the link is shown but never fetched. */
export const PromoSchema = z.object({
  kind: z.enum(PROMO_KINDS),
  title: safeText(80).pipe(z.string().min(3)).refine((s) => !/[\r\n]/.test(s), "title must be a single line"),
  body: safeText(300).pipe(z.string().min(10)),
  link: httpsUrl.optional(),
  tags: z.array(tag).max(5).default([]),
}).strict();
export type Promo = z.infer<typeof PromoSchema>;

export function parsePromo(raw: unknown): { ok: true; promo: Promo } | { ok: false; error: string } {
  const r = PromoSchema.safeParse(raw);
  if (r.success) return { ok: true, promo: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: `invalid post: ${i?.path.join(".") || "body"} ${i?.message ?? ""}`.trim() };
}

export interface MatchCandidate { id: number; ownerKey: string; text: string }

/**
 * Which agents should hear about a request: those whose listing text shares the most terms with it.
 * Deterministic. Skips the poster's own agents (same owner) and anyone with no overlap at all.
 */
export function matchAgents(wanted: { title: string; body: string; tags: string[] }, posterOwner: string, candidates: MatchCandidate[], limit: number = PROMO_LIMITS.notifyTop): number[] {
  const want = terms(`${wanted.title} ${wanted.body} ${wanted.tags.join(" ")}`);
  return candidates
    .filter((c) => c.ownerKey !== posterOwner)
    .map((c) => ({ id: c.id, n: [...terms(c.text)].filter((t) => want.has(t)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.id - b.id)
    .slice(0, limit)
    .map((x) => x.id);
}
