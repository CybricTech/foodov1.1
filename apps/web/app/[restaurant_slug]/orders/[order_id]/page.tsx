"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  Check, Bike, Package,
  AlertCircle, MapPin, ArrowLeft,
  Store, CalendarClock, Loader2,
} from "lucide-react";
import { transformImage } from "@/lib/images";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { OrderEtaCountdown } from "@/components/storefront/order-eta-countdown";
import { OrderStatusAnimation } from "@/components/storefront/order-status-animation";
import { formatKobo } from "@foodo/utils";
import { ORDER_PROGRESS_STEPS_DELIVERY, ORDER_PROGRESS_STEPS_PICKUP } from "@foodo/utils";
import {
  normalizeSchedulingSettings,
  canSelfCancelScheduledOrder,
  formatLagosSlotLabel,
  formatLagosSlotRangeLabel,
} from "@foodo/utils";
import { cn } from "@foodo/ui";
import type { Order } from "@foodo/database";

interface OrderWithItems extends Order {
  order_items: Array<{
    id: string;
    item_name: string;
    item_price_kobo: number;
    quantity: number;
    line_total_kobo: number;
  }>;
}

export default function OrderTrackingPage() {
  const params = useParams<{ restaurant_slug: string; order_id: string }>();
  const { restaurant } = useRestaurant();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const brandColor = restaurant.primary_color ?? "#2D6A4F";

  // Orders are read through /api/orders/[id]/track on the service client. The
  // browser used to query `orders` directly, which only worked because the
  // table had a `USING (true)` policy that also let anyone enumerate every
  // order on the platform. That policy is gone, which also rules out a realtime
  // subscription here (realtime enforces RLS too), so status changes arrive by
  // polling instead — a tracking page does not need sub-second updates.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function fetchOrder(initial: boolean) {
      try {
        const res = await fetch(`/api/orders/${params.order_id}/track`, {
          cache: "no-store",
        });
        if (cancelled) return;

        if (!res.ok) {
          // Only surface an error on first load; a failed poll keeps the last
          // known state on screen rather than blanking the page.
          if (initial) setError("Order not found");
          return;
        }

        const data = (await res.json()) as OrderWithItems;
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled && initial) setError("Order not found");
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    }

    fetchOrder(true);
    timer = setInterval(() => fetchOrder(false), 12_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [params.order_id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="space-y-3">
          <div className="flex justify-center">
            <AlertCircle size={48} className="text-black-300" strokeWidth={1.5} />
          </div>
          <p className="text-black-500 font-medium">{error || "Order not found"}</p>
        </div>
      </div>
    );
  }

  const progressSteps =
    order.fulfillment_type === "delivery"
      ? ORDER_PROGRESS_STEPS_DELIVERY
      : ORDER_PROGRESS_STEPS_PICKUP;

  // assigned_to_rider is an internal dispatch state; from the customer's POV it
  // is the same step as in_transit ("On the way"). Map it before indexing so
  // the stepper lights up and the headline reads naturally.
  const customerFacingStatus =
    order.status === "assigned_to_rider" ? "in_transit" : order.status;

  const currentStepIndex = progressSteps.indexOf(
    customerFacingStatus as (typeof progressSteps)[number]
  );

  const isCancelled = order.status === "cancelled";

  // ── Scheduled (pre-order) state ───────────────────────────────────────────
  // While booked-but-not-activated, the live countdown/stepper make no sense —
  // show a "Scheduled for [slot]" card (+ self-cancel until the cutoff)
  // instead. The moment activated_at flips (cron or merchant pull-forward),
  // the realtime UPDATE re-renders this page straight into the normal
  // tracking UI — no extra branching needed downstream.
  const schedRaw = order as unknown as {
    scheduled_for?: string | null;
    activated_at?: string | null;
  };
  const isScheduledPending =
    Boolean(schedRaw.scheduled_for) &&
    !schedRaw.activated_at &&
    (order.status === "pending" || order.status === "confirmed");

  return (
    <div className="min-h-screen bg-black-50 pb-10">
      {/* ── Branded Header ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-black-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <a
            href={`/${params.restaurant_slug}`}
            className="w-9 h-9 rounded-xl bg-black-50 flex items-center justify-center hover:bg-black-100 transition-colors"
          >
            <ArrowLeft size={16} className="text-black-600" />
          </a>
          {restaurant.logo_url ? (
            <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-black-100 flex-shrink-0">
              <Image
                src={transformImage(restaurant.logo_url, { width: 36, height: 36 })}
                alt={restaurant.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-black-50 flex items-center justify-center flex-shrink-0">
              <Store size={18} className="text-black-400" />
            </div>
          )}
          <div>
            <p className="text-xs text-black-400 font-medium">{restaurant.name}</p>
            <h1 className="font-bold text-black-900 text-lg leading-tight">
              Order #{order.order_number}
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* ── Animated Status Card ─────────────────────────────────── */}
        <div
          className={cn(
            "rounded-2xl p-6 flex flex-col items-center text-center gap-4",
            isCancelled
              ? "bg-cinnabar-50 border border-cinnabar-100"
              : "bg-white border border-black-100 shadow-sm"
          )}
        >
          <OrderStatusAnimation
            status={order.status}
            size={100}
            brandColor={isCancelled ? "#EF4444" : brandColor}
          />
          <div>
            <p className={cn(
              "text-lg font-black",
              isCancelled ? "text-cinnabar-600" : "text-black-900"
            )}>
              {isScheduledPending
                ? "Order scheduled"
                : statusLabel(customerFacingStatus, order.fulfillment_type as "delivery" | "pickup")}
            </p>
            {order.status === "cancelled" && order.cancellation_reason && (
              <p className="text-sm text-black-400 mt-1 leading-relaxed">
                {order.cancellation_reason}
              </p>
            )}
            {!isCancelled && (
              <p className="text-xs text-black-400 mt-1">
                {isScheduledPending
                  ? "We’ll start preparing your order at your booked time"
                  : "We’ll update you as your order progresses"}
              </p>
            )}
          </div>
        </div>

        {/* Scheduled card (pre-orders, before activation) OR ETA countdown */}
        {isScheduledPending ? (
          <ScheduledOrderCard
            orderId={order.id}
            scheduledFor={schedRaw.scheduled_for as string}
            brandColor={brandColor}
          />
        ) : (
          <OrderEtaCountdown
            estimatedDeliveryAt={(order as unknown as { estimated_delivery_at?: string | null }).estimated_delivery_at ?? null}
            status={order.status}
          />
        )}

        {/* ── Progress Stepper ─────────────────────────────────────── */}
        {!isCancelled && !isScheduledPending && (
          <div className="bg-white rounded-2xl border border-black-100 shadow-sm px-4 py-5">
            <h2 className="text-sm font-bold text-black-700 mb-4">Order progress</h2>
            <div className="space-y-0">
              {progressSteps.map((stepStatus, idx) => {
                const isCompleted = idx <= currentStepIndex;
                const isActive = idx === currentStepIndex;
                const isLast = idx === progressSteps.length - 1;

                return (
                  <div key={stepStatus} className="flex items-start gap-3">
                    {/* Dot + line */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300",
                          isCompleted ? "" : "bg-black-100"
                        )}
                        style={isCompleted ? { backgroundColor: brandColor } : undefined}
                      >
                        {isCompleted ? (
                          <Check size={13} className="text-white" strokeWidth={2.5} />
                        ) : (
                          <span className="text-xs font-bold text-black-300">{idx + 1}</span>
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={cn("w-0.5 h-6 transition-colors duration-300", isCompleted ? "" : "bg-black-100")}
                          style={isCompleted ? { backgroundColor: `${brandColor}40` } : undefined}
                        />
                      )}
                    </div>

                    {/* Label */}
                    <div className={cn("pt-1", !isLast && "pb-4")}>
                      <p className={cn(
                        "text-sm font-bold transition-colors",
                        isActive ? "text-black-900" : isCompleted ? "text-black-700" : "text-black-300"
                      )}>
                        {statusLabel(stepStatus, order.fulfillment_type as "delivery" | "pickup")}
                      </p>
                      {isActive && (
                        <p className="text-xs text-black-400 mt-0.5">In progress</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Order Items ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-black-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-black-100 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
            <h2 className="font-bold text-black-900 text-sm">Your order</h2>
          </div>
          <div className="divide-y divide-black-50">
            {order.order_items.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 flex justify-between items-center"
              >
                <span className="text-sm text-black-900">
                  <span className="font-bold" style={{ color: brandColor }}>{item.quantity}×</span>{" "}
                  {item.item_name}
                </span>
                <span className="text-sm font-bold text-black-900">
                  {formatKobo(item.line_total_kobo)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 flex justify-between border-t border-black-100">
            <span className="text-sm font-black text-black-900">Total</span>
            <span className="text-sm font-black text-black-900">
              {formatKobo(order.total_kobo)}
            </span>
          </div>
        </div>

        {/* Delivery address */}
        {order.fulfillment_type === "delivery" && order.delivery_address && (
          <div className="bg-white rounded-2xl border border-black-100 shadow-sm px-4 py-4 flex items-start gap-3">
            <MapPin size={15} className="text-black-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-black-400 font-medium mb-0.5">Delivery to</p>
              <p className="text-sm text-black-900 leading-relaxed">{order.delivery_address}</p>
            </div>
          </div>
        )}

        {/* Order details */}
        <OrderDetailsCard order={order} brandColor={brandColor} />
      </div>
    </div>
  );
}

/**
 * The "Scheduled for [slot]" card shown while a pre-order awaits activation.
 * Self-cancel stays available until scheduled_for − self_cancel_cutoff (the
 * server enforces the same rule); once the order is cancelled the realtime
 * UPDATE flips the whole page to the existing cancelled UI.
 */
function ScheduledOrderCard({
  orderId,
  scheduledFor,
  brandColor,
}: {
  orderId: string;
  scheduledFor: string;
  brandColor: string;
}) {
  const { restaurant } = useRestaurant();
  const schedulingSettings = normalizeSchedulingSettings(
    (restaurant as unknown as { scheduling_settings?: unknown }).scheduling_settings
  );

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  // Re-check the cutoff every 30s so the cancel button retires on time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const slot = new Date(scheduledFor);
  const canCancel = canSelfCancelScheduledOrder(slot, schedulingSettings);

  async function handleCancel() {
    setCancelling(true);
    setCancelError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Couldn't cancel the order. Please try again."
        );
      }
      // On success the realtime UPDATE re-renders the page as cancelled.
    } catch {
      setCancelError("Couldn't cancel the order. Please try again.");
    } finally {
      setCancelling(false);
      setConfirming(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black-100 shadow-sm px-4 py-5 space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${brandColor}14` }}
        >
          <CalendarClock size={20} style={{ color: brandColor }} />
        </div>
        <div>
          <p className="text-xs text-black-400 font-medium">Scheduled for</p>
          <p className="text-base font-black text-black-900">
            {formatLagosSlotRangeLabel(slot, schedulingSettings.slot_granularity_minutes)}
          </p>
        </div>
      </div>

      {canCancel && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="w-full py-2.5 rounded-xl border border-cinnabar-200 text-cinnabar-500 text-sm font-medium hover:bg-cinnabar-50 transition-colors cursor-pointer"
        >
          Cancel order
        </button>
      )}

      {canCancel && confirming && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-black-900 text-center">
            Cancel this scheduled order?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 bg-cinnabar-500 hover:bg-cinnabar-500/90 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {cancelling ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Yes, cancel it"
              )}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={cancelling}
              className="px-4 text-black-500 border border-black-200 text-sm font-medium rounded-xl hover:bg-black-50 transition-colors cursor-pointer"
            >
              Keep it
            </button>
          </div>
        </div>
      )}

      {!canCancel && (
        <p className="text-xs text-black-400 text-center">
          It&rsquo;s too close to your slot to cancel online — please call{" "}
          {restaurant.name} if something changed.
        </p>
      )}

      {cancelError && (
        <p className="text-xs text-cinnabar-500 text-center">{cancelError}</p>
      )}
    </div>
  );
}

function OrderDetailsCard({ order, brandColor }: { order: OrderWithItems; brandColor: string }) {
  const raw = order as unknown as Record<string, unknown>;

  const subtotalKobo     = typeof raw.subtotal_kobo      === "number" ? raw.subtotal_kobo      : 0;
  const deliveryFeeKobo  = typeof raw.delivery_fee_kobo  === "number" ? raw.delivery_fee_kobo  : 0;
  const vatKobo          = typeof raw.vat_kobo           === "number" ? raw.vat_kobo           : 0;
  const serviceFeeKobo   = typeof raw.service_fee_kobo   === "number" ? raw.service_fee_kobo   : 0;
  const discountKobo     = typeof raw.discount_kobo      === "number" ? raw.discount_kobo      : 0;
  const discountCode     = typeof raw.discount_code      === "string" ? raw.discount_code      : null;
  const specialInstructions = typeof raw.special_instructions === "string" ? raw.special_instructions : null;

  const placedAt = new Date(order.created_at);
  const placedAtDate = placedAt.toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const placedAtTime = placedAt.toLocaleTimeString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isDelivery = order.fulfillment_type === "delivery";

  return (
    <div className="bg-white rounded-2xl border border-black-100 shadow-sm px-4 py-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
        <h2 className="text-sm font-bold text-black-700">Order details</h2>
      </div>

      <div className="space-y-3">
        {/* Fulfillment row */}
        <div className="flex items-center gap-2.5">
          {isDelivery ? (
            <Bike size={15} className="text-black-400 flex-shrink-0" strokeWidth={1.75} />
          ) : (
            <Package size={15} className="text-black-400 flex-shrink-0" strokeWidth={1.75} />
          )}
          <span className="text-sm text-black-900 font-medium">
            {isDelivery && order.delivery_address
              ? `Delivery to ${order.delivery_address}`
              : "Pickup"}
          </span>
        </div>

        {/* Placed at */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-black-500">Placed at</span>
          <span className="text-black-900 font-medium">{placedAtDate} · {placedAtTime}</span>
        </div>

        {/* Booked slot — persists after activation so history still shows it */}
        {typeof raw.scheduled_for === "string" && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-black-500">Booked for</span>
            <span className="text-black-900 font-medium">
              {formatLagosSlotLabel(new Date(raw.scheduled_for))}
            </span>
          </div>
        )}

        {/* Price breakdown */}
        {subtotalKobo > 0 && (
          <div className="border-t border-black-100 pt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-black-500">Subtotal</span>
              <span className="text-black-900 font-medium">{formatKobo(subtotalKobo)}</span>
            </div>

            {isDelivery && deliveryFeeKobo > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">Delivery fee</span>
                <span className="text-black-900 font-medium">{formatKobo(deliveryFeeKobo)}</span>
              </div>
            )}

            {vatKobo > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">VAT</span>
                <span className="text-black-900 font-medium">{formatKobo(vatKobo)}</span>
              </div>
            )}

            {serviceFeeKobo > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">Service fee</span>
                <span className="text-black-900 font-medium">{formatKobo(serviceFeeKobo)}</span>
              </div>
            )}

            {discountKobo > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: brandColor }}>
                  Discount{discountCode ? ` (${discountCode})` : ""}
                </span>
                <span className="font-medium" style={{ color: brandColor }}>
                  −{formatKobo(discountKobo)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm border-t border-black-100 pt-2">
              <span className="font-black text-black-900">Total</span>
              <span className="font-black text-black-900">{formatKobo(order.total_kobo)}</span>
            </div>
          </div>
        )}

        {/* Special instructions */}
        {specialInstructions && (
          <div className="border-t border-black-100 pt-3">
            <p className="text-xs text-black-500 font-medium mb-1.5">Special instructions</p>
            <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: `${brandColor}08` }}>
              <p className="text-sm text-black-600 italic leading-relaxed">{specialInstructions}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: string, fulfillmentType?: "delivery" | "pickup"): string {
  const isPickup = fulfillmentType === "pickup";
  const labels: Record<string, string> = {
    pending: "Order received",
    confirmed: "Order confirmed",
    preparing: "Preparing your order",
    ready_for_pickup: "Ready for pickup",
    in_transit: "On the way",
    // A pickup order ends when the customer collects it — never "delivered".
    delivered: isPickup ? "Picked up!" : "Delivered!",
    cancelled: "Order cancelled",
  };
  return labels[status] ?? status;
}
