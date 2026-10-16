import { z } from "zod";

// No control characters, bidi overrides or zero-width characters in any displayed string.
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/;
const text = (max: number) =>
  z.string().trim().max(max).refine((s) => !BAD_CHARS.test(s), "contains control or invisible characters");

const httpsUrl = z
  .string()
  .max(500)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "must be an https URL without credentials");

export const SkillSchema = z.object({
  id: text(64).pipe(z.string().min(1)),
  name: text(80).pipe(z.string().min(1)),
  description: text(300).optional(),
  tags: z.array(text(32).pipe(z.string().min(1))).max(10).optional(),
});

/** A2A-compatible subset. Unknown fields are dropped, never stored or displayed. */
export const AgentCardSchema = z.object({
  name: text(80).pipe(z.string().min(1)),
  description: text(500).optional(),
  url: httpsUrl.optional(),
  version: text(32).optional(),
  provider: z.object({ organization: text(80).optional(), url: httpsUrl.optional() }).optional(),
  skills: z.array(SkillSchema).max(20).default([]),
});

export type AgentCard = z.infer<typeof AgentCardSchema>;

export function parseCard(raw: unknown): { ok: true; card: AgentCard } | { ok: false; error: string } {
  const r = AgentCardSchema.safeParse(raw);
  if (r.success) return { ok: true, card: r.data };
  const first = r.error.issues[0];
  return { ok: false, error: `invalid agent card: ${first?.path.join(".") || "root"} ${first?.message ?? ""}`.trim() };
}
