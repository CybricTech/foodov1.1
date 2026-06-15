"use client";

/**
 * Storefront loyalty progress — shown at checkout once we know the customer's
 * phone. Displays stamp progress toward the reward, and when they've earned it,
 * confirms it'll be applied. For a free-item reward that isn't in the cart yet,
 * it prompts the customer to add a qualifying item (never "ask the restaurant").
 * Promo codes take precedence, so when one is applied we note loyalty defers.
 *
 * Self-fetching from /api/checkout/loyalty-status (sends the cart so a free item
 * can be valued) so the big checkout page only has to drop it in.
 */
import { useEffect, useState } from "react";
import { Gift, PlusCircle, Sparkles, Check } from "lucide-react";

const BRAND_GRADIENT = "linear-gradient(140deg, #10002B 0%, #3C096C 55%, #7B2CBF 100%)";

type CartItem = { menuItemId: string; unitPriceKobo: number };

type Status = {
  active: boolean;
  rewardType: string;
  balance: number;
  required: number;
  remaining: number;
  redeemable: boolean;
  rewardLabel: string;
  autoAppliable: boolean;
  freeItemNames: string[];
};

export function LoyaltyProgressCard({
  restaurantId,
  phone,
  phoneValid,
  subtotalKobo,
  deliveryFeeKobo,
  items,
  hasPromo,
}: {
  restaurantId: string;
  phone: string;
  phoneValid: boolean;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  items: CartItem[];
  /** A promo code is applied — loyalty defers to it. */
  hasPromo: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);

  // Re-fetch when the cart total/items change so a free item gets valued live.
  const itemsKey = items.map((i) => `${i.menuItemId}:${i.unitPriceKobo}`).join(",");

  useEffect(() => {
    if (!phoneValid || !restaurantId) {
      setStatus(null);
      return;
    }
    let active = true;
    fetch("/api/checkout/loyalty-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, phone, subtotalKobo, deliveryFeeKobo, items }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (active) setStatus(d?.active ? (d as Status) : null);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, phone, phoneValid, subtotalKobo, deliveryFeeKobo, itemsKey]);

  if (!status || !status.active) return null;

  const willApply = status.redeemable && status.autoAppliable && !hasPromo;
  const needsItem =
    status.redeemable && status.rewardType === "free_item" && !status.autoAppliable && !hasPromo;
  const earnedButPromo = status.redeemable && hasPromo;
  const itemList =
    status.freeItemNames.length > 0 ? status.freeItemNames.join(" or ") : "a qualifying item";

  // ── Unlocked & auto-applied: full celebratory gradient card ──────────────
  if (willApply) {
    return (
      <div
        className="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg"
        style={{ background: BRAND_GRADIENT }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full"
          style={{ background: "rgba(255,255,255,0.07)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full"
          style={{ background: "rgba(255,255,255,0.05)" }}
        />
        <div className="relative">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-white/80" strokeWidth={2.5} />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
              Loyalty reward
            </span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white">
              <Check size={11} strokeWidth={3} /> Applied
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Gift size={24} className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-black leading-tight text-white">
                {status.rewardLabel} unlocked!
              </p>
              <p className="mt-0.5 text-sm text-white/70">Applied automatically at checkout.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Earned a free item but it's not in the cart: inviting nudge ──────────
  if (needsItem) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-purple-100 bg-purple-50 p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <Gift size={14} className="text-purple-500" strokeWidth={2.5} />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-purple-500">
            Reward ready
          </span>
        </div>
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ background: BRAND_GRADIENT }}
          >
            <Gift size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-black leading-tight text-purple-900">
              You&rsquo;ve earned {status.rewardLabel}!
            </p>
            <p className="mt-1 flex items-start gap-1.5 text-sm leading-snug text-purple-700">
              <PlusCircle size={15} className="mt-0.5 flex-shrink-0 text-purple-400" />
              <span>
                Add <span className="font-bold">{itemList}</span> to your order and it&rsquo;s on
                the house.
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Earned but a promo is applied: gentle note ───────────────────────────
  if (earnedButPromo) {
    return (
      <div className="rounded-3xl border border-purple-100 bg-purple-50 p-5">
        <div className="mb-2 flex items-center gap-1.5">
          <Gift size={14} className="text-purple-500" strokeWidth={2.5} />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-purple-500">
            Reward saved
          </span>
        </div>
        <p className="text-sm leading-snug text-purple-900">
          You&rsquo;ve earned <span className="font-bold">{status.rewardLabel}</span> — it&rsquo;ll
          apply on an order where you don&rsquo;t use a promo code.
        </p>
      </div>
    );
  }

  // ── Progress toward the reward: the stamp card ───────────────────────────
  return (
    <div className="overflow-hidden rounded-3xl border border-purple-100 bg-white">
      <div className="flex items-center justify-between border-b border-purple-100 bg-purple-50 px-5 py-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-purple-500" strokeWidth={2.5} />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-purple-500">
            Loyalty card
          </span>
        </div>
        <span className="text-xs font-bold text-purple-700">
          {status.balance}
          <span className="text-purple-400">/{status.required}</span>
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm font-semibold leading-snug text-black-900">
          {status.remaining === 1 ? (
            <>
              Just <span className="text-purple-500">1 more order</span> until{" "}
              {status.rewardLabel}
            </>
          ) : (
            <>
              <span className="text-purple-500">{status.remaining} more orders</span> until{" "}
              {status.rewardLabel}
            </>
          )}
        </p>

        <div className="mt-3.5">
          <StampGrid required={status.required} filled={status.balance} variant="light" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stamp card visual — a grid of stamp slots that fill as earned, the */
/*  final slot showing the reward (gift). Shared metaphor used on the   */
/*  customer card and (via the config) the merchant live preview.       */
/* ------------------------------------------------------------------ */

export function StampGrid({
  required,
  filled,
  variant,
}: {
  required: number;
  /** How many stamps are collected so far. */
  filled: number;
  /** "dark" = on the purple gradient; "light" = on a white/lilac surface. */
  variant: "dark" | "light";
}) {
  // Cap the rendered slots so very large programs stay tidy; the count badge
  // elsewhere still communicates the true total.
  const total = Math.max(1, Math.min(required || 0, 12));
  const got = Math.max(0, Math.min(filled, total));
  const rewardIndex = total - 1;

  const dark = variant === "dark";

  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-6">
      {Array.from({ length: total }).map((_, i) => {
        const isReward = i === rewardIndex;
        const isFilled = i < got;
        const rewardEarned = isReward && got >= total;

        // Reward slot — always rendered as the prize, lit up once earned.
        if (isReward) {
          return (
            <div
              key={i}
              className={`relative flex aspect-square items-center justify-center rounded-xl ${
                rewardEarned
                  ? "text-white shadow-sm"
                  : dark
                  ? "border-2 border-dashed border-white/40 text-white/60"
                  : "border-2 border-dashed border-purple-200 text-purple-300"
              }`}
              style={rewardEarned ? { background: BRAND_GRADIENT } : undefined}
            >
              <Gift size={16} strokeWidth={2.25} />
            </div>
          );
        }

        return (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-xl transition-colors ${
              isFilled
                ? dark
                  ? "bg-white text-purple-700"
                  : "bg-purple-500 text-white shadow-sm"
                : dark
                ? "border border-white/25 bg-white/5 text-transparent"
                : "border border-purple-100 bg-purple-50 text-transparent"
            }`}
          >
            {isFilled ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  dark ? "bg-white/30" : "bg-purple-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
