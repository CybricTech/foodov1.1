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
import { Gift, Plus, Sparkles, Check } from "lucide-react";
import { useCartStore } from "@/lib/stores/cart";

const BRAND_GRADIENT = "linear-gradient(140deg, #10002B 0%, #3C096C 55%, #7B2CBF 100%)";

/** Normalise to #rrggbb, falling back to the Kitchyn purple. */
function hex(color: string | undefined): string {
  return color && /^#?[0-9a-fA-F]{6}$/.test(color) ? `#${color.replace("#", "")}` : "#7B2CBF";
}
/** Append a 2-hex alpha to a #rrggbb color for tints/borders. */
function tint(color: string, alpha: string): string {
  return `${hex(color)}${alpha}`;
}

type CartItem = { menuItemId: string; unitPriceKobo: number };
type FreeItem = { id: string; name: string; priceKobo: number };

type Status = {
  active: boolean;
  rewardType: string;
  balance: number;
  required: number;
  remaining: number;
  redeemable: boolean;
  rewardLabel: string;
  autoAppliable: boolean;
  rewardSubtotalKobo: number;
  rewardDeliveryKobo: number;
  freeItemNames: string[];
  freeItems: FreeItem[];
};

/** What the reward takes off this order, split to mirror the server's maths. */
export type AppliedLoyaltyReward = { subtotalKobo: number; deliveryKobo: number };

export function LoyaltyProgressCard({
  restaurantId,
  restaurantSlug,
  brandColor,
  phone,
  phoneValid,
  subtotalKobo,
  deliveryFeeKobo,
  items,
  hasPromo,
  onRewardChange,
}: {
  restaurantId: string;
  restaurantSlug: string;
  /** The merchant's brand colour (#rrggbb) — the card is themed to it. */
  brandColor: string;
  phone: string;
  phoneValid: boolean;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  items: CartItem[];
  /** A promo code is applied — loyalty defers to it. */
  hasPromo: boolean;
  /** Reports the discount the reward applies to this order (0/0 when none). */
  onRewardChange?: (reward: AppliedLoyaltyReward) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const addItem = useCartStore((s) => s.addItem);

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

  // Report the discount the reward applies to this order so the checkout can
  // show a "Loyalty reward −₦X" line and reflect it in the total. Loyalty only
  // applies when redeemable, valued, and no promo is in use (promo wins).
  useEffect(() => {
    if (!onRewardChange) return;
    const applies = !!status && status.active && status.redeemable && status.autoAppliable && !hasPromo;
    onRewardChange(
      applies
        ? { subtotalKobo: status.rewardSubtotalKobo, deliveryKobo: status.rewardDeliveryKobo }
        : { subtotalKobo: 0, deliveryKobo: 0 }
    );
  }, [status, hasPromo, onRewardChange]);

  if (!status || !status.active) return null;

  const brand = hex(brandColor);
  const willApply = status.redeemable && status.autoAppliable && !hasPromo;
  const needsItem =
    status.redeemable && status.rewardType === "free_item" && !status.autoAppliable && !hasPromo;
  const earnedButPromo = status.redeemable && hasPromo;
  const itemList =
    status.freeItemNames.length > 0 ? status.freeItemNames.join(" or ") : "a qualifying item";
  // The cheapest eligible free item — the one we offer to one-tap add.
  const addable = status.freeItems[0];

  function quickAddReward() {
    if (!addable) return;
    addItem(restaurantId, restaurantSlug, {
      menuItemId: addable.id,
      name: addable.name,
      price: addable.priceKobo,
      quantity: 1,
      selectedOptions: [],
      optionsKey: "",
    });
  }

  // Dashed boundary themed to the merchant's colour, on every state.
  const dashed = (alpha: string) => ({ borderColor: tint(brand, alpha) });

  // ── Unlocked & auto-applied: full celebratory brand card ─────────────────
  if (willApply) {
    return (
      <div
        className="relative overflow-hidden rounded-3xl border-2 border-dashed p-5 text-white shadow-lg"
        style={{ background: brand, borderColor: "rgba(255,255,255,0.45)" }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full"
          style={{ background: "rgba(255,255,255,0.10)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full"
          style={{ background: "rgba(255,255,255,0.07)" }}
        />
        <div className="relative">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles size={14} className="text-white/80" strokeWidth={2.5} />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
              Loyalty reward
            </span>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white">
              <Check size={11} strokeWidth={3} /> Applied
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/25">
              <Gift size={24} className="text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-black leading-tight text-white">
                {status.rewardLabel} unlocked!
              </p>
              <p className="mt-0.5 text-sm text-white/75">Applied automatically at checkout.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Earned a free item but it's not in the cart: nudge + one-tap add ─────
  if (needsItem) {
    return (
      <div
        className="relative overflow-hidden rounded-3xl border-2 border-dashed p-5"
        style={{ background: tint(brand, "0F"), ...dashed("66") }}
      >
        <div className="mb-3 flex items-center gap-1.5">
          <Gift size={14} strokeWidth={2.5} style={{ color: brand }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: brand }}>
            Reward ready
          </span>
        </div>
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ background: brand }}
          >
            <Gift size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black leading-tight text-black-900">
              You&rsquo;ve earned {status.rewardLabel}!
            </p>
            <p className="mt-1 text-sm leading-snug text-black-600">
              Add <span className="font-bold">{itemList}</span> and it&rsquo;s on the house.
            </p>
            {addable && (
              <button
                onClick={quickAddReward}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95"
                style={{ background: brand }}
              >
                <Plus size={16} strokeWidth={3} /> Add free {addable.name}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Earned but a promo is applied: gentle note ───────────────────────────
  if (earnedButPromo) {
    return (
      <div
        className="rounded-3xl border-2 border-dashed p-5"
        style={{ background: tint(brand, "0F"), ...dashed("66") }}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <Gift size={14} strokeWidth={2.5} style={{ color: brand }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: brand }}>
            Reward saved
          </span>
        </div>
        <p className="text-sm leading-snug text-black-800">
          You&rsquo;ve earned <span className="font-bold">{status.rewardLabel}</span> — it&rsquo;ll
          apply on an order where you don&rsquo;t use a promo code.
        </p>
      </div>
    );
  }

  // ── Progress toward the reward: the stamp card ───────────────────────────
  return (
    <div
      className="overflow-hidden rounded-3xl border-2 border-dashed bg-white"
      style={dashed("55")}
    >
      <div
        className="flex items-center justify-between border-b border-dashed px-5 py-3"
        style={{ background: tint(brand, "0D"), ...dashed("44") }}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={2.5} style={{ color: brand }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: brand }}>
            Loyalty card
          </span>
        </div>
        <span className="text-xs font-bold" style={{ color: brand }}>
          {status.balance}
          <span style={{ color: tint(brand, "99") }}>/{status.required}</span>
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm font-semibold leading-snug text-black-900">
          {status.remaining === 1 ? (
            <>
              Just <span style={{ color: brand }}>1 more order</span> until {status.rewardLabel}
            </>
          ) : (
            <>
              <span style={{ color: brand }}>{status.remaining} more orders</span> until{" "}
              {status.rewardLabel}
            </>
          )}
        </p>

        <div className="mt-3.5">
          <StampGrid
            required={status.required}
            filled={status.balance}
            variant="light"
            brandColor={brand}
          />
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
  brandColor,
}: {
  required: number;
  /** How many stamps are collected so far. */
  filled: number;
  /** "dark" = on a coloured surface; "light" = on a white surface. */
  variant: "dark" | "light";
  /** Optional merchant brand colour (#rrggbb); defaults to the Kitchyn purple. */
  brandColor?: string;
}) {
  // Cap the rendered slots so very large programs stay tidy; the count badge
  // elsewhere still communicates the true total.
  const total = Math.max(1, Math.min(required || 0, 12));
  const got = Math.max(0, Math.min(filled, total));
  const rewardIndex = total - 1;

  const dark = variant === "dark";
  const themed = !!brandColor;
  const brand = hex(brandColor);

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
              className={`relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed ${
                rewardEarned
                  ? "text-white shadow-sm"
                  : dark
                  ? "border-white/40 text-white/60"
                  : !themed
                  ? "border-purple-200 text-purple-300"
                  : ""
              }`}
              style={
                rewardEarned
                  ? { background: themed ? brand : BRAND_GRADIENT, borderColor: "transparent" }
                  : themed && !dark
                  ? { borderColor: tint(brand, "55"), color: tint(brand, "AA") }
                  : undefined
              }
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
                  : !themed
                  ? "bg-purple-500 text-white shadow-sm"
                  : "text-white shadow-sm"
                : dark
                ? "border border-white/25 bg-white/5 text-transparent"
                : !themed
                ? "border border-purple-100 bg-purple-50 text-transparent"
                : "text-transparent"
            }`}
            style={
              themed && !dark
                ? isFilled
                  ? { background: brand }
                  : { background: tint(brand, "0F"), borderColor: tint(brand, "33"), borderWidth: 1 }
                : undefined
            }
          >
            {isFilled ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  dark ? "bg-white/30" : !themed ? "bg-purple-200" : ""
                }`}
                style={themed && !dark ? { background: tint(brand, "55") } : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
