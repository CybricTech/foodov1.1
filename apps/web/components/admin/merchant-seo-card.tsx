import type { Restaurant } from "@foodo/database";
import {
  OFF_PAGE_ACTIONS,
  googleBusinessProfileUrl,
  seoReadiness,
  type ReadinessImpact,
} from "@/lib/seo/readiness";
import { storefrontHost, storefrontUrl } from "@/lib/site";

const IMPACT_STYLE: Record<ReadinessImpact, string> = {
  critical: "bg-cinnabar-100 text-cinnabar-500",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-black-100 text-black-500",
};

function scoreTone(score: number): string {
  if (score >= 85) return "text-viridian-600";
  if (score >= 55) return "text-amber-600";
  return "text-cinnabar-500";
}

/**
 * Search-readiness for one merchant.
 *
 * Exists because the thing gating storefront rankings is missing merchant data,
 * not missing markup — and until now nobody could see which merchant was missing
 * what. Each unmet check names the concrete consequence so this reads as a work
 * queue rather than a vanity score.
 */
export function MerchantSeoCard({ restaurant }: { restaurant: Restaurant }) {
  const report = seoReadiness(restaurant);
  const gbpUrl = googleBusinessProfileUrl(restaurant);
  const canonical = storefrontUrl(restaurant.slug);

  return (
    <div className="border border-black-100 rounded-2xl p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-black-900">Search readiness</h2>
          <p className="text-xs text-black-400 mt-0.5">
            What this storefront gives Google. Canonical URL:{" "}
            <a
              href={canonical}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-500 hover:text-purple-400"
            >
              {storefrontHost(restaurant.slug)}
            </a>
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-extrabold leading-none ${scoreTone(report.score)}`}>
            {report.score}
            <span className="text-sm font-bold text-black-300">/100</span>
          </p>
          <p className="text-xs text-black-400 mt-1">
            {report.done} of {report.total} complete
          </p>
        </div>
      </div>

      <ul className="space-y-2" role="list">
        {report.checks.map((check) => (
          <li
            key={check.id}
            className={`flex items-start gap-3 rounded-xl px-3 py-2 ${
              check.done ? "bg-black-50/50" : "bg-white border border-black-100"
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                check.done
                  ? "bg-viridian-100 text-viridian-600"
                  : "bg-black-100 text-black-400"
              }`}
            >
              {check.done ? "✓" : "—"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-semibold ${
                    check.done ? "text-black-400 line-through" : "text-black-900"
                  }`}
                >
                  {check.label}
                </span>
                {!check.done && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${IMPACT_STYLE[check.impact]}`}
                  >
                    {check.impact}
                  </span>
                )}
              </div>
              {!check.done && (
                <>
                  <p className="text-xs text-black-500 mt-1 leading-relaxed">
                    {check.effect}
                  </p>
                  <p className="text-[11px] text-black-400 mt-1">{check.fixIn}</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-black-100 pt-4">
        <h3 className="text-xs font-bold text-black-900">
          Off-page — do these manually
        </h3>
        <p className="text-xs text-black-400 mt-0.5 leading-relaxed">
          We publish links out to this merchant&apos;s profiles. Google only treats
          the storefront as their official site once the links come back the other
          way, and we can&apos;t detect that from here.
        </p>

        <ul className="mt-3 space-y-2" role="list">
          {OFF_PAGE_ACTIONS.map((action) => (
            <li key={action.id} className="text-xs">
              <span className="font-semibold text-black-700">{action.label}</span>
              <p className="text-black-400 mt-0.5 leading-relaxed">{action.detail}</p>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          {gbpUrl ? (
            <a
              href={gbpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm text-purple-500 hover:text-purple-400 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-xl transition-colors"
            >
              Open Google Business Profile &rarr;
            </a>
          ) : (
            <p className="text-xs text-cinnabar-500">
              No Google listing linked — verify this store&apos;s address first, so
              we know which profile is theirs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
