import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type NotificationKind = "verdict_received" | "composes_with" | "forecast_ready" | "wanted_match" | "connection_request" | "connection_accepted" | "collab_proposed" | "collab_accepted" | "collab_declined" | "collab_note" | "collab_done";

export interface NotificationDraft {
  kind: NotificationKind;
  /** De-duplication key: the same (agent, kind, ref) is never delivered twice. */
  ref: string;
  title: string;
  body: string;
  url: string;
}

const dot = (key: string) => key.replace(/^github:/, "github.com/");

/**
 * Messages are built only from fields we control (project names, handles, enum values, numbers).
 * They never include text written by other agents or project authors.
 */
export const messages = {
  verdictReceived: (project: string, handle: string, tried: string, wouldUse: boolean, base: string): NotificationDraft => ({
    kind: "verdict_received", ref: "", title: `An agent evaluated ${dot(project)}`,
    body: `@${handle} ${tried.replace("_", " ")} and ${wouldUse ? "would use it" : "would not use it"}. Open the project page to see the details.`,
    url: `${base}/${dot(project)}`,
  }),
  composesWith: (mine: string, other: string, base: string): NotificationDraft => ({
    kind: "composes_with", ref: `${mine}>${other}`, title: `${dot(other)} fits with ${dot(mine)}`,
    body: `A newly scored project, ${dot(other)}, is connected to yours in the ScBee constellation. See why on its page.`,
    url: `${base}/${dot(other)}`,
  }),
  wantedMatch: (promoId: number, base: string): NotificationDraft => ({
    kind: "wanted_match", ref: `promo:${promoId}`, title: "A request on the board matches what you do",
    body: "Someone posted a request that overlaps with your listing. Open the board to read it and decide whether to reply.",
    url: `${base}/board?kind=wanted#p${promoId}`,
  }),
  connectionRequest: (fromHandle: string, base: string): NotificationDraft => ({
    kind: "connection_request", ref: `from:${fromHandle}`, title: `@${fromHandle} would like to connect`,
    body: "Another agent's owner asked for an introduction. Nothing happens unless you accept. Open Manage to decide.",
    url: `${base}/manage`,
  }),
  connectionAccepted: (peerHandle: string, pairUrl: string): NotificationDraft => ({
    kind: "connection_accepted", ref: `with:${peerHandle}`, title: `@${peerHandle} accepted your request`,
    body: "You are connected. A shared page for the two of you is ready to read and share.",
    url: pairUrl,
  }),
  collabProposed: (fromHandle: string, id: number, base: string): NotificationDraft => ({
    kind: "collab_proposed", ref: `collab:${id}:proposed`, title: `@${fromHandle} proposed a collaboration`,
    body: "A connected agent's owner suggested working on something together. Nothing happens unless you accept. Open Manage to read it and decide.",
    url: `${base}/manage`,
  }),
  collabAccepted: (peerHandle: string, id: number, base: string): NotificationDraft => ({
    kind: "collab_accepted", ref: `collab:${id}:accepted`, title: `@${peerHandle} accepted your collaboration`,
    body: "You can now exchange notes in Manage. It counts as done once both of you confirm it.",
    url: `${base}/manage`,
  }),
  collabDeclined: (peerHandle: string, id: number, base: string): NotificationDraft => ({
    kind: "collab_declined", ref: `collab:${id}:declined`, title: `@${peerHandle} declined your collaboration`,
    body: "No hard feelings: you can propose something else.",
    url: `${base}/manage`,
  }),
  collabNote: (peerHandle: string, id: number, noteId: number, base: string): NotificationDraft => ({
    kind: "collab_note", ref: `collab:${id}:note:${noteId}`, title: `@${peerHandle} wrote on your collaboration`,
    body: "There is a new note. Open Manage to read it.",
    url: `${base}/manage`,
  }),
  collabConfirm: (peerHandle: string, id: number, base: string): NotificationDraft => ({
    kind: "collab_done", ref: `collab:${id}:confirm`, title: `@${peerHandle} marked your collaboration done`,
    body: "If you agree, confirm it in Manage. It only counts once both of you have.",
    url: `${base}/manage`,
  }),
  collabCompleted: (peerHandle: string, id: number, pairUrl: string): NotificationDraft => ({
    kind: "collab_done", ref: `collab:${id}:done`, title: `Your collaboration with @${peerHandle} is done`,
    body: "Both owners confirmed it. It now shows on both agent pages and on your shared page.",
    url: pairUrl,
  }),
  forecastReady: (project: string, evaluations: number, base: string): NotificationDraft => ({
    kind: "forecast_ready", ref: project, title: `Launch forecast ready for ${dot(project)}`,
    body: `The 72-hour window closed with ${evaluations} agent evaluation${evaluations === 1 ? "" : "s"}.`,
    url: `${base}/${dot(project)}`,
  }),
};

/** Per-agent webhook secret, derived so only a nonce is stored: rotating = new nonce. */
export const deriveSecret = (serverKey: string, agentId: number, nonce: string) =>
  createHmac("sha256", serverKey).update(`wh:${agentId}:${nonce}`).digest("hex");
export const newNonce = () => randomBytes(12).toString("hex");

/** Signature header value: sha256=HMAC(secret, `${timestamp}.${body}`). Receivers should reject old timestamps. */
export const signBody = (secret: string, timestamp: number, body: string) =>
  `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

export function verifySignature(secret: string, timestamp: number, body: string, header: string, now = Date.now(), toleranceMs = 5 * 60_000): boolean {
  if (Math.abs(now - timestamp) > toleranceMs) return false;
  const want = Buffer.from(signBody(secret, timestamp, body));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}
