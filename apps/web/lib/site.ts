/**
 * Host classification + canonical URL construction.
 *
 * ONE source of truth for two things:
 *   1. What a given Host header MEANS (storefront? apex? dashboard?) — consumed
 *      by middleware.ts for routing and by robots.ts / sitemap.ts for indexing.
 *   2. How a Kitchyn URL is SPELLED in metadata, sitemaps and structured data.
 *
 * ── Why the canonical storefront URL is the subdomain ──────────────────────
 * Every storefront is reachable at three URLs that all return identical HTML:
 *
 *   1. https://<slug>.kitchyn.app/           ← CANONICAL
 *   2. https://kitchyn.app/<slug>            middleware serves the apex path form
 *   3. https://<slug>.kitchyn.app/<slug>     middleware skips its own rewrite when
 *                                            the path already starts with the slug,
 *                                            and every internal <Link> is written
 *                                            `/${slug}/menu`, so ordinary in-site
 *                                            navigation lands here
 *
 * (1) wins because it is the URL merchants actually promote: the printed QR
 * flyer encodes it (lib/qr-flyer.ts) and the white-label promise is that the
 * storefront is the restaurant's own address, not a path on ours.
 *
 * Consolidation is done with rel=canonical ONLY — deliberately no redirects.
 * Form (2) ships in the merchant welcome email (api/admin/merchants/onboard),
 * and form (3) is produced by every internal link, including the RSC requests
 * Next.js issues during client-side navigation. Redirecting either would put a
 * hop in the middle of working flows to buy indexing behaviour that the
 * canonical tag already delivers. See also lib/seo/metadata.ts.
 */

/**
 * Public storefront domain. Storefronts live at `{slug}.kitchyn.app` (handled by
 * middleware). Overridable for staging/preview via NEXT_PUBLIC_STOREFRONT_DOMAIN.
 */
export const STOREFRONT_DOMAIN =
  process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN?.trim() || "kitchyn.app";

/**
 * Subdomains that are NOT restaurant storefronts.
 *
 * `www` and `staging` must behave like the apex domain (path-based slug routing,
 * e.g. /get-drizzys) rather than being treated as a restaurant named "staging".
 * `dashboard` and `admin` have their own redirects in middleware.
 */
const RESERVED_SUBDOMAINS = {
  www: "www",
  staging: "staging",
  dashboard: "dashboard",
  admin: "admin",
} as const;

export type HostRole =
  /** A merchant storefront, e.g. `spicesenz.kitchyn.app`. */
  | { role: "storefront"; slug: string }
  /** The bare apex, e.g. `kitchyn.app`. Serves the landing page + path-form storefronts. */
  | { role: "apex" }
  /** `www.kitchyn.app` — behaves like the apex. */
  | { role: "www" }
  /** `staging.kitchyn.app` — behaves like the apex, but must never be indexed. */
  | { role: "staging" }
  | { role: "dashboard" }
  | { role: "admin" }
  /** localhost, *.vercel.app previews, anything not under STOREFRONT_DOMAIN. */
  | { role: "unknown" };

/**
 * Classify a Host header.
 *
 * Mirrors the logic middleware.ts used to inline, with identical results for
 * every production host. The one difference is that the port is stripped before
 * comparison, so a local `spicesenz.kitchyn.app:3000` now classifies as a
 * storefront instead of falling through to path routing — production hosts
 * never carry a port, so prod behaviour is unchanged.
 *
 * Note the slug is the WHOLE label prefix, so a nested host like
 * `a.b.kitchyn.app` yields slug "a.b" and 404s at the storefront layout, exactly
 * as it did before. (A `*.kitchyn.app` wildcard cert only matches one label, so
 * such a host cannot reach the app in the first place.)
 */
export function classifyHost(hostHeader: string | null | undefined): HostRole {
  const host = (hostHeader ?? "").split(":")[0].trim().toLowerCase();
  if (!host) return { role: "unknown" };

  if (host === STOREFRONT_DOMAIN) return { role: "apex" };

  const suffix = `.${STOREFRONT_DOMAIN}`;
  if (!host.endsWith(suffix)) return { role: "unknown" };

  const sub = host.slice(0, -suffix.length);
  if (!sub) return { role: "unknown" };

  switch (sub) {
    case RESERVED_SUBDOMAINS.www:
      return { role: "www" };
    case RESERVED_SUBDOMAINS.staging:
      return { role: "staging" };
    case RESERVED_SUBDOMAINS.dashboard:
      return { role: "dashboard" };
    case RESERVED_SUBDOMAINS.admin:
      return { role: "admin" };
    default:
      return { role: "storefront", slug: sub };
  }
}

/**
 * Paths that must be served from the HOST ROOT and never rewritten into a
 * storefront path.
 *
 * `robots.txt` is only honoured at the root of the host it governs, and a
 * sitemap may only list URLs at or below its own directory — so on
 * `spicesenz.kitchyn.app` both have to resolve at `/`, not `/spicesenz/`.
 * Before this list existed the storefront rewrite turned all three into
 * `/spicesenz/robots.txt` and friends, which 404'd (that is also why the PWA
 * manifest never loaded on a storefront subdomain).
 */
const HOST_ROOT_PATHS = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
]);

/** Whether a path must bypass the storefront-subdomain rewrite. */
export function isHostRootPath(pathname: string): boolean {
  return HOST_ROOT_PATHS.has(pathname);
}

// ─── Canonical URL builders ─────────────────────────────────────────────────

/** Origin of the marketing/apex site, e.g. `https://kitchyn.app`. */
export function apexOrigin(): string {
  return `https://${STOREFRONT_DOMAIN}`;
}

/** Storefront host for a merchant, e.g. `spicesenz.kitchyn.app`. */
export function storefrontHost(slug: string): string {
  return `${slug}.${STOREFRONT_DOMAIN}`;
}

/** Canonical origin for a merchant's storefront, e.g. `https://spicesenz.kitchyn.app`. */
export function storefrontOrigin(slug: string): string {
  return `https://${storefrontHost(slug)}`;
}

/**
 * Canonical absolute URL for a storefront path. `path` is relative to the
 * merchant's own root, so pass "/" or "/menu" — never "/{slug}/menu".
 */
export function storefrontUrl(slug: string, path = "/"): string {
  const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${storefrontOrigin(slug)}${suffix}`;
}

/** Canonical absolute URL on the apex site. */
export function apexUrl(path = "/"): string {
  const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `${apexOrigin()}${suffix}`;
}
