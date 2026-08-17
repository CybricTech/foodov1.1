import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { apexOrigin, classifyHost, storefrontOrigin } from "@/lib/site";

/**
 * Per-host robots.txt.
 *
 * One deploy answers for the apex, every merchant subdomain, staging and Vercel
 * preview URLs — and each needs different rules — so this reads the Host header
 * rather than emitting a single static file. Reading headers() makes the route
 * dynamic, which is fine: it's three lines of text with no DB access.
 *
 * Requires the middleware exclusion in lib/site.ts (isHostRootPath). Without it
 * the storefront rewrite turns `spicesenz.kitchyn.app/robots.txt` into
 * `/spicesenz/robots.txt`, which 404s — and a 404 robots.txt means crawlers fall
 * back to "crawl everything", including checkout.
 */
export default function robots(): MetadataRoute.Robots {
  const host = classifyHost(headers().get("host"));

  // Storefront subdomain: the merchant's own site. Index the storefront and the
  // menu; keep bots out of the transactional funnel, which is per-customer,
  // uncacheable and worthless in search results.
  if (host.role === "storefront") {
    const origin = storefrontOrigin(host.slug);
    return {
      rules: [
        {
          userAgent: "*",
          allow: "/",
          disallow: ["/checkout", "/orders", "/api/"],
        },
      ],
      sitemap: `${origin}/sitemap.xml`,
      host: origin,
    };
  }

  if (host.role === "apex" || host.role === "www") {
    return {
      rules: [
        {
          userAgent: "*",
          allow: "/",
          // /dashboard and /admin are behind auth, but an unauthenticated
          // crawler still gets a login page worth indexing at zero. The
          // per-slug transactional paths are disallowed by pattern because the
          // apex serves every storefront under a path prefix.
          disallow: [
            "/admin",
            "/dashboard",
            "/api/",
            "/logout",
            "/offline",
            "/delivery/",
            "/*/checkout",
            "/*/orders",
          ],
        },
      ],
      sitemap: `${apexOrigin()}/sitemap.xml`,
      host: apexOrigin(),
    };
  }

  // staging.kitchyn.app, *.vercel.app previews, anything unrecognised: a
  // byte-identical copy of production. Indexing these splits ranking signals
  // between hosts and can surface staging to real customers.
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
