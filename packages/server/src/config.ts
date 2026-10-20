/**
 * Who is running this copy of the site. Everything here is shown to visitors (links, the security contact, the example
 * project on the home page), so a fork changes it in one place instead of editing the code. One configuration per process.
 * The protocol names (the verify file, the data envelope tags, webhook headers) are deliberately not here, so that
 * copies of the site stay compatible with each other and with the MCP server.
 */
export interface SiteConfig {
  /** Display name used in the web manifest and the agent card. */
  name: string;
  /** Public source repository, linked from the footer and the docs links. */
  repoUrl: string;
  /** Where to report a security problem privately. */
  securityUrl: string;
  /** The security policy document. */
  policyUrl: string;
  /** owner/repo of the project shown as the live example on the home page. */
  specimen: string;
}

const DEFAULT_REPO = "https://github.com/HMAKT99/ScBee";
const DEFAULTS: SiteConfig = {
  name: "ScBee",
  repoUrl: DEFAULT_REPO,
  securityUrl: `${DEFAULT_REPO}/security/advisories/new`,
  policyUrl: `${DEFAULT_REPO}/blob/main/SECURITY.md`,
  specimen: "HMAKT99/ScBee",
};

let current: SiteConfig = { ...DEFAULTS };
export const getSite = (): SiteConfig => current;

const httpsUrl = (v: string | undefined) => {
  if (!v) return undefined;
  try { const u = new URL(v); return u.protocol === "https:" ? u.toString().replace(/\/$/, "") : undefined; } catch { return undefined; }
};
const slug = (v: string | undefined) => (v && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(v) ? v : undefined);

/** Apply overrides. Anything missing or invalid keeps its default; links derived from the repo follow it. */
export function configureSite(p: Partial<SiteConfig> = {}): SiteConfig {
  const repoUrl = httpsUrl(p.repoUrl) ?? DEFAULTS.repoUrl;
  const fromRepo = httpsUrl(p.repoUrl) !== undefined;
  const gh = repoUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/)?.[1];
  current = {
    name: p.name?.trim().slice(0, 40) || DEFAULTS.name,
    repoUrl,
    securityUrl: httpsUrl(p.securityUrl) ?? (fromRepo ? `${repoUrl}/security/advisories/new` : DEFAULTS.securityUrl),
    policyUrl: httpsUrl(p.policyUrl) ?? (fromRepo ? `${repoUrl}/blob/main/SECURITY.md` : DEFAULTS.policyUrl),
    specimen: slug(p.specimen) ?? (fromRepo && gh ? gh : DEFAULTS.specimen),
  };
  return current;
}

/** Read the SITE_* environment variables (empty ones are ignored). */
export function siteFromEnv(env: Record<string, string | undefined>): Partial<SiteConfig> {
  const v = (k: string) => env[k]?.trim() || undefined;
  return { name: v("SITE_NAME"), repoUrl: v("SITE_REPO_URL"), securityUrl: v("SITE_SECURITY_URL"), policyUrl: v("SITE_POLICY_URL"), specimen: v("SITE_SPECIMEN") };
}
