import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import {
  getCachedIndexableStorefronts,
  getCachedRestaurant,
  withFallback,
} from "@/lib/supabase/storefront-cache";
import { apexUrl, classifyHost, storefrontUrl } from "@/lib/site";

/**
 * Per-host sitemap.
 *
 * On a merchant subdomain it lists that merchant's pages; on the apex it lists
 * the marketing page plus every merchant's CANONICAL (subdomain) URL. Because
 * all hosts sit under one registrable domain, a single GSC *domain property*
 * covers the lot and the apex sitemap is allowed to reference other subdomains
 * — which is what makes 17 storefronts discoverable from one submitted file.
 *
 * Every URL here is built with the lib/site.ts helpers, so a sitemap entry and
 * the <link rel="canonical"> on the page it points at can never disagree.
 *
 * DB reads go through the cached helpers (1h for the roster, 5m per merchant),
 * so a crawler hammering this route doesn't reach Supabase.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = classifyHost(headers().get("host"));

  if (host.role === "storefront") {
    const restaurant = await withFallback(
      getCachedRestaurant(host.slug),
      null,
      "sitemap:restaurant"
    );
    // Unknown or deactivated slug — the storefront itself 404s, so advertise
    // nothing rather than an empty-but-valid URL set.
    if (!restaurant) return [];

    const lastModified = new Date(restaurant.updated_at);
    return [
      {
        url: storefrontUrl(host.slug, "/"),
        lastModified,
        changeFrequency: "weekly",
        priority: 1,
      },
      {
        url: storefrontUrl(host.slug, "/menu"),
        lastModified,
        // Prices and sold-out state move daily; the menu is also the page that
        // actually ranks for "<brand> menu".
        changeFrequency: "daily",
        priority: 0.9,
      },
    ];
  }

  if (host.role === "apex" || host.role === "www") {
    const merchants = await withFallback(
      getCachedIndexableStorefronts(),
      [],
      "sitemap:storefronts"
    );

    return [
      {
        url: apexUrl("/"),
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 1,
      },
      ...merchants.flatMap((m) => {
        const lastModified = new Date(m.updated_at);
        return [
          {
            url: storefrontUrl(m.slug, "/"),
            lastModified,
            changeFrequency: "weekly" as const,
            priority: 0.9,
          },
          {
            url: storefrontUrl(m.slug, "/menu"),
            lastModified,
            changeFrequency: "daily" as const,
            priority: 0.8,
          },
        ];
      }),
    ];
  }

  // staging / previews / unknown hosts are disallowed wholesale in robots.ts.
  return [];
}
