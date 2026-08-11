"use client";

import { cn } from "@foodo/ui";

/**
 * ▲/▼ percentage-of-change badge vs a baseline (trailing-7-day mean this wave).
 *
 * Contract (docs/live-ops-v2-ux.md §4.3):
 * - deltaPct == null (or non-finite) ⇒ render nothing — covers zero baselines
 *   and blocked metrics.
 * - invert: true ⇒ up = red, down = green (for Late Orders / Unconfirmed when
 *   a same-day-last-week baseline ships in a later wave).
 * - aria-label: "up 12% vs last week" / "down 12% vs last week" — screen
 *   readers never hear the "▲" glyph.
 * - title: "vs last 7 days avg" — the honest comparison the data contract
 *   supports today (§13.10).
 */
export function KpiDelta({
  deltaPct,
  invert = false,
}: {
  /** Percentage change vs baseline. null → render nothing. */
  deltaPct: number | null;
  /** true: up = red (negative metrics like Late / Unconfirmed). */
  invert?: boolean;
}) {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null;

  const up = deltaPct > 0;
  const absPct = Math.abs(deltaPct).toFixed(0);
  // up + !invert → emerald · down + !invert → cinnabar · up + invert →
  // cinnabar · down + invert → emerald
  const toneClass = up !== invert ? "text-emerald-700" : "text-cinnabar-500";

  return (
    <span
      className={cn("text-[11px] font-semibold", toneClass)}
      title="vs last 7 days avg"
      aria-label={`${up ? "up" : "down"} ${absPct}% vs last week`}
    >
      {up ? "▲" : "▼"} {absPct}%
    </span>
  );
}