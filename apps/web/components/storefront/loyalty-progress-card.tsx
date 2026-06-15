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
import { Stamp, Gift, PlusCircle } from "lucide-react";

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
  const itemList =
    status.freeItemNames.length > 0 ? status.freeItemNames.join(" or ") : "a qualifying item";

  const dots = Math.min(status.required, 12);
  const filled = Math.min(status.balance, dots);

  return (
    <div
      className="rounded-2xl p-4 border"
      style={{
        background: willApply ? "linear-gradient(135deg,#10002B,#5A189A)" : "#faf7ff",
        borderColor: willApply ? "transparent" : "#E0AAFF",
      }}
    >
      <div className="flex items-center gap-2">
        <Stamp size={15} className={willApply ? "text-white/80" : "text-purple-500"} />
        <p
          className={`text-xs font-bold uppercase tracking-wide ${
            willApply ? "text-white/70" : "text-purple-600"
          }`}
        >
          Loyalty
        </p>
      </div>

      {willApply ? (
        <>
          <p className="text-white font-extrabold text-base mt-2 flex items-center gap-1.5">
            <Gift size={16} /> {status.rewardLabel} unlocked!
          </p>
          <p className="text-white/60 text-xs mt-1">Applied automatically at checkout.</p>
        </>
      ) : needsItem ? (
        <>
          <p className="text-black-800 font-bold text-base mt-2 flex items-center gap-1.5">
            <Gift size={16} className="text-purple-500" /> You&rsquo;ve earned {status.rewardLabel}!
          </p>
          <p className="text-sm text-black-600 mt-1 flex items-start gap-1.5">
            <PlusCircle size={15} className="text-purple-500 mt-0.5 flex-shrink-0" />
            <span>
              Add <span className="font-semibold">{itemList}</span> to your order and it&rsquo;s on
              the house.
            </span>
          </p>
        </>
      ) : status.redeemable && hasPromo ? (
        <p className="text-sm text-black-600 mt-2">
          You&rsquo;ve earned <span className="font-semibold">{status.rewardLabel}</span> — it&rsquo;ll
          apply on an order where you don&rsquo;t use a promo code.
        </p>
      ) : (
        <>
          <p className="text-sm text-black-700 mt-2">
            <span className="font-bold">{status.remaining}</span> more{" "}
            {status.remaining === 1 ? "order" : "orders"} until{" "}
            <span className="font-semibold">{status.rewardLabel}</span>
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {Array.from({ length: dots }).map((_, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full ${i < filled ? "bg-purple-500" : "bg-purple-100"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
