"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Check, XCircle, PackageCheck, Bike, Package,
  UtensilsCrossed, Clock, AlertCircle, MapPin,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { OrderEtaCountdown } from "@/components/storefront/order-eta-countdown";
import { formatKobo } from "@foodo/utils";
import { ORDER_PROGRESS_STEPS_DELIVERY, ORDER_PROGRESS_STEPS_PICKUP } from "@foodo/utils";
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

function OrderStatusIcon({ status, size = 40 }: { status: string; size?: number }) {
  const props = { size, strokeWidth: 1.5 };
  switch (status) {
    case "cancelled":   return <XCircle {...props} className="text-cinnabar-500" />;
    case "delivered":   return <PackageCheck {...props} className="text-green-500" />;
    case "in_transit":  return <Bike {...props} className="text-primary" />;
    case "ready_for_pickup": return <Package {...props} className="text-green-500" />;
    case "preparing":   return <UtensilsCrossed {...props} className="text-primary" />;
    default:            return <Clock {...props} className="text-dixie-500" />;
  }
}

export default function OrderTrackingPage() {
  const params = useParams<{ restaurant_slug: string; order_id: string }>();
  const { restaurant } = useRestaurant();
  const supabase = createBrowserClient();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchOrder() {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(`*, order_items (id, item_name, item_price_kobo, quantity, line_total_kobo)`)
        .eq("id", params.order_id)
        .single();

      if (fetchError || !data) {
        setError("Order not found");
      } else {
        setOrder(data as unknown as OrderWithItems);
      }
      setLoading(false);
    }

    fetchOrder();

    channel = supabase
      .channel(`order-${params.order_id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${params.order_id}` },
        (payload) => {
          setOrder((prev) =>
            prev ? { ...prev, ...(payload.new as Partial<OrderWithItems>) } : null
          );
        }
      )
      .subscribe();

    return () => { channel?.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const currentStepIndex = progressSteps.indexOf(
    order.status as (typeof progressSteps)[number]
  );

  const isCancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-black-50 pb-10">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 py-4">
        <p className="text-xs text-black-400 font-medium">{restaurant.name}</p>
        <h1 className="font-bold text-black-900 text-lg leading-tight">
          Order #{order.order_number}
        </h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Status card */}
        <div
          className={cn(
            "rounded-2xl p-6 flex flex-col items-center text-center gap-3",
            isCancelled ? "bg-cinnabar-50 border border-cinnabar-100" : "bg-primary/5 border border-primary/10"
          )}
        >
          <OrderStatusIcon status={order.status} size={44} />
          <div>
            <p className={cn(
              "text-lg font-bold",
              isCancelled ? "text-cinnabar-600" : "text-primary"
            )}>
              {statusLabel(order.status)}
            </p>
            {order.status === "cancelled" && order.cancellation_reason && (
              <p className="text-sm text-black-400 mt-1 leading-relaxed">
                {order.cancellation_reason}
              </p>
            )}
          </div>
        </div>

        {/* ETA countdown */}
        <OrderEtaCountdown
          estimatedDeliveryAt={(order as unknown as { estimated_delivery_at?: string | null }).estimated_delivery_at ?? null}
          status={order.status}
          fulfillmentType={order.fulfillment_type as "delivery" | "pickup"}
        />

        {/* Progress stepper */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl border border-black-100 px-4 py-5">
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
                          isCompleted ? "bg-primary" : "bg-black-100"
                        )}
                      >
                        {isCompleted ? (
                          <Check size={13} className="text-white" strokeWidth={2.5} />
                        ) : (
                          <span className="text-xs font-bold text-black-300">{idx + 1}</span>
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={cn(
                            "w-0.5 h-6 transition-colors duration-300",
                            isCompleted ? "bg-primary/30" : "bg-black-100"
                          )}
                        />
                      )}
                    </div>

                    {/* Label */}
                    <div className={cn("pt-1", !isLast && "pb-4")}>
                      <p className={cn(
                        "text-sm font-medium transition-colors",
                        isActive ? "text-primary" : isCompleted ? "text-black-800" : "text-black-300"
                      )}>
                        {statusLabel(stepStatus)}
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

        {/* Order items */}
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-100">
            <h2 className="font-bold text-black-900 text-sm">Your order</h2>
          </div>
          <div className="divide-y divide-black-50">
            {order.order_items.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 flex justify-between items-center"
              >
                <span className="text-sm text-black-900">
                  <span className="font-semibold text-black-500">{item.quantity}×</span>{" "}
                  {item.item_name}
                </span>
                <span className="text-sm font-semibold text-black-900">
                  {formatKobo(item.line_total_kobo)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-black-50 flex justify-between border-t border-black-100">
            <span className="text-sm font-bold text-black-900">Total</span>
            <span className="text-sm font-bold text-black-900">
              {formatKobo(order.total_kobo)}
            </span>
          </div>
        </div>

        {/* Delivery address */}
        {order.fulfillment_type === "delivery" && order.delivery_address && (
          <div className="bg-white rounded-2xl border border-black-100 px-4 py-4 flex items-start gap-3">
            <MapPin size={15} className="text-black-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-black-400 font-medium mb-0.5">Delivery to</p>
              <p className="text-sm text-black-900 leading-relaxed">{order.delivery_address}</p>
            </div>
          </div>
        )}

        {/* Order details */}
        <OrderDetailsCard order={order} />
      </div>
    </div>
  );
}

function OrderDetailsCard({ order }: { order: OrderWithItems }) {
  const raw = order as unknown as Record<string, unknown>;

  const subtotalKobo     = typeof raw.subtotal_kobo      === "number" ? raw.subtotal_kobo      : 0;
  const deliveryFeeKobo  = typeof raw.delivery_fee_kobo  === "number" ? raw.delivery_fee_kobo  : 0;
  const vatKobo          = typeof raw.vat_kobo           === "number" ? raw.vat_kobo           : 0;
  const serviceFeeKobo   = typeof raw.service_fee_kobo   === "number" ? raw.service_fee_kobo   : 0;
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
    <div className="bg-white rounded-2xl border border-black-100 px-4 py-5">
      <h2 className="text-sm font-bold text-black-700 mb-4">Order details</h2>

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

            <div className="flex items-center justify-between text-sm border-t border-black-100 pt-2">
              <span className="font-bold text-black-900">Total</span>
              <span className="font-bold text-black-900">{formatKobo(order.total_kobo)}</span>
            </div>
          </div>
        )}

        {/* Special instructions */}
        {specialInstructions && (
          <div className="border-t border-black-100 pt-3">
            <p className="text-xs text-black-500 font-medium mb-1.5">Special instructions</p>
            <div className="bg-black-50 rounded-xl px-3 py-2.5">
              <p className="text-sm text-black-500 italic leading-relaxed">{specialInstructions}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Order received",
    confirmed: "Order confirmed",
    preparing: "Preparing your order",
    ready_for_pickup: "Ready for pickup",
    in_transit: "On the way",
    delivered: "Delivered!",
    cancelled: "Order cancelled",
  };
  return labels[status] ?? status;
}
