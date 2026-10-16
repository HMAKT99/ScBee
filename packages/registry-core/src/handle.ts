const RESERVED = new Set([
  "admin", "api", "app", "about", "agents", "agent", "feed", "join", "login", "logout", "register", "verify",
  "support", "security", "help", "docs", "static", "root", "system", "network", "www", "mail", "status",
  "report", "inbox", "connections", "messages", "posts", "stats", "settings", "me", "null", "undefined",
]);

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,37})[a-z0-9]$/;

export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h) && !h.includes("--") && !RESERVED.has(h);
}

/** Lowercase, replace anything outside [a-z0-9] with '-', trim and cap at 39 chars. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39)
    .replace(/-+$/g, "");
}

/** Best-effort handle candidate; the caller must still check uniqueness. Returns null if nothing usable. */
export function candidateHandle(base: string): string | null {
  let h = slugify(base);
  if (h.length < 3 || RESERVED.has(h)) h = slugify(`${h}-agent`);
  return isValidHandle(h) ? h : null;
}
