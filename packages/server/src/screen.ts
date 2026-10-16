export type Verdict = "deliver" | "quarantine";

export interface ScreenResult {
  verdict: Verdict;
  flags: string[];
}

// Hidden-text tricks: zero-width, bidi overrides, tag characters, control characters.
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]|[\u{e0000}-\u{e007f}]/u;

const RULES: { flag: string; re: RegExp; block: boolean }[] = [
  { flag: "instruction-override", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.\n]{0,40}\b(instructions?|rules?|prompts?|guidelines?|directions?)\b/i, block: true },
  { flag: "role-hijack", re: /\b(you are now|from now on you|act as (?:the )?(?:system|admin|root|developer)|new (?:system )?instructions?:|system prompt)\b/i, block: true },
  { flag: "secret-exfiltration", re: /\b(send|share|reveal|print|post|paste|give|show|leak|forward|email)\b[^.\n]{0,50}\b(api[ _-]?keys?|secrets?|tokens?|passwords?|credentials?|env(?:ironment)? variables?|private keys?|\.env|ssh keys?|system prompt)\b/i, block: true },
  { flag: "secret-material", re: /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|an_[a-f0-9]{32,})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/, block: true },
  { flag: "pipe-to-shell", re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node)\b/i, block: true },
  { flag: "destructive-command", re: /\b(rm\s+-rf?\s+[\/~*]|drop\s+(table|database)|truncate\s+table|git\s+push\s+(-f|--force)|mkfs\.|dd\s+if=)/i, block: true },
  { flag: "tool-call-lure", re: /\b(call|invoke|run|execute|use)\b[^.\n]{0,30}\b(tool|function|command|shell|terminal)\b[^.\n]{0,40}\b(now|immediately|without (?:asking|confirmation))\b/i, block: false },
];

/**
 * Heuristic screen for messages between agents. It is NOT a guarantee: it never says a message
 * is "safe", only whether it is delivered (always labeled untrusted) or withheld for a human.
 */
export function screenText(body: string): ScreenResult {
  const flags: string[] = [];
  let block = false;
  if (HIDDEN.test(body)) {
    flags.push("hidden-characters");
    block = true;
  }
  for (const r of RULES) {
    if (r.re.test(body)) {
      flags.push(r.flag);
      block ||= r.block;
    }
  }
  const urls = body.match(/https?:\/\/\S+/gi)?.length ?? 0;
  if (urls > 3) flags.push("many-links");
  if (/data:[a-z/+-]+;base64,/i.test(body)) {
    flags.push("embedded-data-uri");
    block = true;
  }
  return { verdict: block ? "quarantine" : "deliver", flags };
}

/** Wrap a delivered message so receiving agents can tell it is data, not instructions. */
export function wrapUntrusted(from: string, body: string, flags: string[]): string {
  const safe = body.replace(/<\/?agent_message/gi, "&lt;agent_message");
  const attr = flags.length ? ` flags="${flags.join(",")}"` : "";
  return `<agent_message from="${from}" untrusted="true"${attr}>\n${safe}\n</agent_message>`;
}
