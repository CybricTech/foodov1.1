/**
 * Per-merchant SEO readiness.
 *
 * The bottleneck on ranking storefronts is not markup — that ships for everyone
 * — it's that merchants onboard nearly empty. api/admin/merchants/onboard
 * inserts name/slug/city and nulls the rest, and the remaining fields are
 * self-service, so a storefront can sit live for months with no description, no
 * address and no socials. That merchant gets a thin page no matter how good the
 * structured data is.
 *
 * Every check below maps to a specific thing that appears (or silently doesn't)
 * in the rendered output, so ops can see exactly what a missing field costs.
 * See lib/seo/json-ld.ts and lib/seo/metadata.ts for the consuming code.
 */
import type { Restaurant } from "@foodo/database";

export type ReadinessImpact = "critical" | "high" | "medium";

export interface ReadinessCheck {
  id: string;
  label: string;
  done: boolean;
  impact: ReadinessImpact;
  /** What this field actually controls, in concrete terms. */
  effect: string;
  /** Where the merchant or admin fixes it. */
  fixIn: string;
}

export interface ReadinessReport {
  checks: ReadinessCheck[];
  done: number;
  total: number;
  /** 0–100, weighted by impact rather than a flat count. */
  score: number;
  /** Unmet checks, most damaging first. */
  blockers: ReadinessCheck[];
}

const WEIGHT: Record<ReadinessImpact, number> = {
  critical: 3,
  high: 2,
  medium: 1,
};

/** A description short enough to be a placeholder isn't a description. */
const MIN_DESCRIPTION_CHARS = 40;

export function seoReadiness(r: Restaurant): ReadinessReport {
  const hasSocial = !!(
    r.instagram_url?.trim() ||
    r.facebook_url?.trim() ||
    r.twitter_url?.trim() ||
    r.youtube_url?.trim()
  );

  const checks: ReadinessCheck[] = [
    {
      id: "description",
      label: `Description (${MIN_DESCRIPTION_CHARS}+ characters)`,
      done: (r.description?.trim().length ?? 0) >= MIN_DESCRIPTION_CHARS,
      impact: "critical",
      effect:
        "The meta description Google prints under the result. Without it we fall back to a generated one-liner that says nothing specific about this restaurant.",
      fixIn: "Merchant → Settings → Restaurant details",
    },
    {
      id: "google_place",
      label: "Linked to a Google listing",
      done: !!r.place_id,
      impact: "critical",
      effect:
        "Without a place_id we can't reach their Business Profile — and the Website field on that profile is the single highest-converting link to the storefront.",
      fixIn: "Admin → verify the store address (sets place_id)",
    },
    {
      id: "address",
      label: "Street address",
      done: !!r.address?.trim(),
      impact: "critical",
      effect:
        "Drives the PostalAddress in structured data. Missing it, Google gets a city and nothing else, and local relevance drops sharply.",
      fixIn: "Merchant → Settings → Location",
    },
    {
      id: "social",
      label: "At least one social profile",
      done: hasSocial,
      impact: "high",
      effect:
        "Emitted as schema.org sameAs — the signal that says this URL and that Instagram are the same business. This is how Google links the storefront to the real-world brand.",
      fixIn: "Merchant → Settings → Social links",
    },
    {
      id: "location_verified",
      label: "Coordinates verified",
      done: !!r.location_verified_at,
      impact: "high",
      effect:
        "Unverified coordinates are withheld from structured data on purpose — one store's stored position was ~20km off (migration 094), and wrong geo is worse than none.",
      fixIn: "Admin → Merchant → verify address",
    },
    {
      id: "phone",
      label: "Phone number",
      done: !!r.phone?.trim(),
      impact: "high",
      effect:
        "Populates telephone in structured data and gives the storefront a call affordance.",
      fixIn: "Merchant → Settings → Restaurant details",
    },
    {
      id: "logo",
      label: "Logo uploaded",
      done: !!r.logo_url?.trim(),
      impact: "high",
      effect:
        "Used as the favicon, the structured-data logo, and the share-card fallback when there's no banner.",
      fixIn: "Merchant → Settings → Branding",
    },
    {
      id: "banner",
      label: "Banner uploaded",
      done: !!r.banner_url?.trim(),
      impact: "medium",
      effect:
        "The 1200×630 image on WhatsApp/iMessage previews. Without it the link forwards as a text-only card, which gets clicked noticeably less.",
      fixIn: "Merchant → Settings → Branding",
    },
    {
      id: "opening_hours",
      label: "Opening hours set",
      done: !!r.opening_hours && Object.keys(r.opening_hours).length > 0,
      impact: "medium",
      effect:
        "Emitted as openingHoursSpecification, which is what lets a result show open/closed state. We stay silent rather than imply 24/7.",
      fixIn: "Merchant → Settings → Opening hours",
    },
  ];

  const done = checks.filter((c) => c.done).length;
  const earned = checks.reduce((n, c) => n + (c.done ? WEIGHT[c.impact] : 0), 0);
  const possible = checks.reduce((n, c) => n + WEIGHT[c.impact], 0);

  const order: ReadinessImpact[] = ["critical", "high", "medium"];
  const blockers = checks
    .filter((c) => !c.done)
    .sort((a, b) => order.indexOf(a.impact) - order.indexOf(b.impact));

  return {
    checks,
    done,
    total: checks.length,
    score: Math.round((earned / possible) * 100),
    blockers,
  };
}

/**
 * Deep link to a merchant's Google Business Profile from the stored place_id, so
 * an admin can jump straight there to set the Website field. Null when we don't
 * know their listing.
 */
export function googleBusinessProfileUrl(r: Restaurant): string | null {
  if (!r.place_id) return null;
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(r.place_id)}`;
}

/**
 * Off-page actions that decide whether a storefront ranks for its merchant's
 * name, and that we cannot detect from our own database.
 *
 * Reciprocity is the point: we already publish sameAs pointing at their
 * profiles, but Google only treats the storefront as the business's own site
 * when the link comes back the other way too.
 */
export const OFF_PAGE_ACTIONS = [
  {
    id: "gbp_website",
    label: "Google Business Profile → Website field set to the storefront",
    detail:
      "The highest-leverage action available. This is the button searchers actually press in the profile panel, and it's the return leg that confirms the storefront belongs to this business.",
  },
  {
    id: "instagram_bio",
    label: "Instagram bio link → the storefront",
    detail:
      "Second return leg for the same entity signal, and usually the merchant's largest existing audience.",
  },
  {
    id: "nap_match",
    label: "Name, address and phone identical to the Google listing",
    detail:
      "Mismatched details between the profile and the storefront weaken the association between them.",
  },
  {
    id: "gsc_indexed",
    label: "Storefront submitted in Search Console",
    detail:
      "A brand-new subdomain with no inbound links can sit undiscovered for weeks. Request indexing once to skip the wait.",
  },
] as const;
