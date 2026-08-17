import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { NavBar } from "@/app/_components/nav-bar";
import {
  getCachedIndexableStorefronts,
  withFallback,
} from "@/lib/supabase/storefront-cache";
import { transformImage } from "@/lib/images";
import { apexUrl, storefrontHost, storefrontUrl } from "@/lib/site";
import { JsonLd } from "@/components/seo/json-ld";

/**
 * "Restaurants growing with Kitchyn" — the merchant roster on the apex.
 *
 * Two jobs, in this order:
 *
 *   1. SEO plumbing. Every storefront is its own subdomain starting from zero
 *      authority with no inbound links anywhere on the public web (the QR
 *      flyers are offline). This page is the crawl path: one page on the apex
 *      linking to all of them, so Google can discover each storefront and some
 *      link equity flows from the only domain of ours that will ever accumulate
 *      any. Links are plain and followed — the whole point is passing value.
 *
 *   2. Social proof for merchant acquisition, which is what the rest of the
 *      apex site is for.
 *
 * Deliberately NOT a discovery/marketplace surface: no search, no cuisine or
 * area filters, no ratings, ordered alphabetically rather than by anything that
 * implies ranking between merchants. docs/PRD.md:175 rules out platform-level
 * customer discovery, and a page that picks winners among your own merchants
 * would compete with the direct relationships they pay you to own.
 */
export const revalidate = 3600;

const TITLE = "Restaurants on Kitchyn";
const DESCRIPTION =
  "Independent restaurants across Abuja taking direct online orders through their own Kitchyn storefronts.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/restaurants" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/restaurants",
    type: "website",
  },
};

export default async function RestaurantsPage() {
  const merchants = await withFallback(
    getCachedIndexableStorefronts(),
    [],
    "partners:storefronts"
  );

  return (
    <div className="min-h-screen bg-white">
      {/* ItemList tells Google this is a roster of named entities and how they
          rank relative to each other — which here is "they don't", it's just
          alphabetical order. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: TITLE,
          description: DESCRIPTION,
          url: apexUrl("/restaurants"),
          numberOfItems: merchants.length,
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          itemListElement: merchants.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: m.name,
            url: storefrontUrl(m.slug),
          })),
        }}
      />

      <NavBar />

      <main>
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <h1
            className="text-4xl md:text-6xl font-semibold text-[#3C096C] leading-[1.05] tracking-tight mb-6"
            style={{ fontFamily: "Poppins, system-ui, sans-serif" }}
          >
            <span className="text-[#1e1b1c]">Restaurants</span> growing with Kitchyn.
          </h1>
          <p className="max-w-2xl mx-auto text-base md:text-lg text-[#1e1b1c]/60 leading-relaxed">
            {merchants.length > 0
              ? `${merchants.length} independent brands taking direct orders on their own branded storefronts — no aggregator commissions.`
              : DESCRIPTION}
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <ul
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            role="list"
          >
            {merchants.map((m) => (
              <li key={m.slug}>
                <Link
                  href={storefrontUrl(m.slug)}
                  className="group h-full flex flex-col gap-3 p-5 rounded-2xl border border-gray-100 hover:border-[#3C096C]/30 hover:shadow-lg transition-all duration-200 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {m.logo_url ? (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 bg-white">
                        <Image
                          src={transformImage(m.logo_url, { width: 48, height: 48 })}
                          alt={`${m.name} logo`}
                          fill
                          className="object-cover"
                          sizes="48px"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#3C096C]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#3C096C] font-bold text-lg">
                          {m.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-[#1e1b1c] leading-tight truncate">
                        {m.name}
                      </h2>
                      {m.city && (
                        <p className="text-xs text-[#1e1b1c]/50 mt-0.5">{m.city}</p>
                      )}
                    </div>
                  </div>

                  {m.description && (
                    <p className="text-sm text-[#1e1b1c]/60 leading-relaxed line-clamp-2">
                      {m.description}
                    </p>
                  )}

                  <span className="mt-auto text-xs font-medium text-[#3C096C]/70 group-hover:text-[#3C096C] transition-colors truncate">
                    {storefrontHost(m.slug)} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {merchants.length === 0 && (
            <p className="text-center text-sm text-[#1e1b1c]/50 py-12">
              Our restaurant roster is loading. Please check back shortly.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
