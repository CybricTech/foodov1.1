"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { formatKobo } from "@foodo/utils";
import { ORDER_PROGRESS_STEPS } from "@foodo/utils";
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
  const supabase = createBrowserClient();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchOrder() {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(
          `*, order_items (id, item_name, item_price_kobo, quantity, line_total_kobo)`
        )
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

    // Subscribe to real-time updates
    channel = supabase
      .channel(`order-${params.order_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${params.order_id}`,
        },
        (payload) => {
          setOrder((prev) =>
            prev
              ? { ...prev, ...(payload.new as Partial<OrderWithItems>) }
              : null
          );
        }
      )
      .subscribe();

    return () => {
      channel?.unsubscribe();
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
        <div>
          <p className="text-2xl mb-2">🙁</p>
          <p className="text-black-500">{error || "Order not found"}</p>
        </div>
      </div>
    );
  }

  const currentStepIndex = ORDER_PROGRESS_STEPS.indexOf(
    order.status as (typeof ORDER_PROGRESS_STEPS)[number]
  );

  const isCancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-black-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 py-4">
        <h1 className="font-bold text-black-900">
          Order #{order.order_number}
        </h1>
        <p className="text-sm text-black-400 mt-0.5">{restaurant.name}</p>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Status card */}
        <div
          className={cn(
            "rounded-2xl p-5 text-center",
            isCancelled ? "bg-cinnabar-100" : "bg-primary/5"
          )}
        >
          <div className="text-4xl mb-2">
            {isCancelled
              ? "❌"
              : order.status === "delivered"
              ? "✅"
              : order.status === "in_transit"
              ? "🛵"
              : order.status === "ready_for_pickup"
              ? "🍽️"
              : "👨‍🍳"}
          </div>
          <p
            className={cn(
              "text-lg font-bold",
              isCancelled ? "text-cinnabar-500" : "text-primary"
            )}
          >
            {statusLabel(order.status)}
          </p>
          {order.status === "cancelled" && order.cancellation_reason && (
            <p className="text-sm text-black-400 mt-1">
              {order.cancellation_reason}
            </p>
          )}
        </div>

        {/* Progress stepper */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl border border-black-100 p-4">
            {ORDER_PROGRESS_STEPS.map((stepStatus, idx) => {
              const isCompleted = idx <= currentStepIndex;
              const isActive = idx === currentStepIndex;
              return (
                <div key={stepStatus} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors",
                        isCompleted
                          ? "bg-primary text-white"
                          : "bg-black-100 text-black-300"
                      )}
                    >
                      {isCompleted ? "✓" : idx + 1}
                    </div>
                    {idx < ORDER_PROGRESS_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "w-0.5 h-6 mt-1 transition-colors",
                          isCompleted ? "bg-primary/40" : "bg-black-100"
                        )}
                      />
                    )}
                  </div>
                  <div className="pt-1.5 pb-4">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isActive
                          ? "text-primary"
                          : isCompleted
                          ? "text-black-900"
                          : "text-black-300"
                      )}
                    >
                      {statusLabel(stepStatus)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Order items */}
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-100">
            <h2 className="font-semibold text-black-900 text-sm">
              Your order
            </h2>
          </div>
          {order.order_items.map((item) => (
            <div
              key={item.id}
              className="px-4 py-3 flex justify-between items-center border-b border-black-50 last:border-0"
            >
              <span className="text-sm text-black-900">
                {item.quantity}× {item.item_name}
              </span>
              <span className="text-sm font-medium text-black-900">
                {formatKobo(item.line_total_kobo)}
              </span>
            </div>
          ))}
          <div className="px-4 py-3 bg-black-50 flex justify-between">
            <span className="text-sm font-bold text-black-900">Total</span>
            <span className="text-sm font-bold text-black-900">
              {formatKobo(order.total_kobo)}
            </span>
          </div>
        </div>

        {/* Delivery address */}
        {order.fulfillment_type === "delivery" && order.delivery_address && (
          <div className="bg-white rounded-2xl border border-black-100 px-4 py-3">
            <p className="text-xs text-black-400 mb-1">Delivery to</p>
            <p className="text-sm text-black-900">{order.delivery_address}</p>
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
