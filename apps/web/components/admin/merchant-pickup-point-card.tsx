"use client";

import { PickupPointPicker } from "@/components/shared/pickup-point-picker";

/**
 * Rider pickup point for one merchant, from the admin side.
 *
 * The same control the merchant has in Settings, because the two roles find out
 * about the problem from opposite ends: the merchant knows where their door is,
 * but support is who hears that riders keep phoning. Whoever learns it first
 * should be able to fix it.
 */
export function MerchantPickupPointCard({
  restaurantId,
  locationVerified,
  pickupLabel,
  hasPickupPoint,
}: {
  restaurantId: string;
  locationVerified: boolean;
  pickupLabel: string | null;
  hasPickupPoint: boolean;
}) {
  return (
    <div className="border border-black-100 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-black-900">Rider pickup point</h2>
        <p className="text-xs text-black-400 mt-0.5">
          Bolt tells riders a street name, never the business name — so a pin nearer the road
          behind the shop sends them to the wrong side. Move the pickup onto the street the
          entrance is on.
        </p>
      </div>

      {locationVerified ? (
        <PickupPointPicker
          endpoint="/api/admin/merchants/pickup-point"
          restaurantId={restaurantId}
          initialLabel={pickupLabel}
          initialIsStorefront={!hasPickupPoint}
        />
      ) : (
        <p className="text-xs text-black-500 bg-black-50 rounded-xl px-3 py-2.5">
          This store&apos;s address isn&apos;t confirmed, so there is no trustworthy point to
          measure from — and Bolt booking is skipped for it anyway. Confirm the address first.
        </p>
      )}
    </div>
  );
}
