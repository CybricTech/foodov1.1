import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle, UtensilsCrossed, Phone, MapPin, Clock, ArrowLeft, Store } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@foodo/database";
import { formatKobo } from "@foodo/utils";

export const dynamic = "force-dynamic";

interface SuccessPageProps {
  params: { restaurant_slug: string; order_id: string };
}

export async function generateMetadata({ params }: SuccessPageProps) {
  const supabase = await createServerClient();
  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);
  return {
    title: `Order Confirmed — ${restaurant?.name ?? "Restaurant"}`,
  };
}

export default async function OrderSuccessPage({ params }: SuccessPageProps) {
  const supabase = await createServerClient();

  const restaurant = await getRestaurantBySlug(supabase, params.restaurant_slug);
  if (!restaurant) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select(`
      id, order_number, status, fulfillment_type,
      customer_name, customer_phone, customer_email,
      delivery_address, special_instructions,
      subtotal_kobo, delivery_fee_kobo, vat_kobo, service_fee_kobo, total_kobo,
      estimated_delivery_at, created_at,
      order_items (id, item_name, item_price_kobo, quantity, line_total_kobo)
    `)
    .eq("id", params.order_id)
    .single();

  if (!order) {
    return (
      <div className="min-h-screen bg-black-50 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-black-100 flex items-center justify-center mx-auto animate-pulse">
            <Clock size={24} className="text-black-400" />
          </div>
          <p className="text-sm font-medium text-black-600">Confirming your order…</p>
          <p className="text-xs text-black-400">This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  const brandColor = restaurant.primary_color ?? "#2D6A4F";
  const isDelivery = order.fulfillment_type === "delivery";

  const placedAt = new Date(order.created_at);
  const placedTime = placedAt.toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const eta = order.estimated_delivery_at
    ? new Date(order.estimated_delivery_at).toLocaleTimeString("en-NG", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="min-h-screen bg-black-50 pb-10">
      {/* Header */}
      <div
        className="px-4 py-6 text-white"
        style={{ backgroundColor: brandColor }}
      >
        <div className="flex items-center justify-between mb-4">
          <Link
            href={`/${params.restaurant_slug}`}
            className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
          >
            <ArrowLeft size={16} />
            Back to store
          </Link>
          <Link
            href={`/${params.restaurant_slug}/orders/${order.id}`}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full transition-colors"
          >
            Track order
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {restaurant.logo_url ? (
            <div className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-white/30 bg-white flex-shrink-0">
              <Image
                src={restaurant.logo_url}
                alt={restaurant.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Store size={28} className="text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-white" strokeWidth={2.5} />
              <h1 className="text-xl font-bold">Payment successful</h1>
            </div>
            <p className="text-white/80 text-sm mt-0.5">
              {restaurant.name} has received your order
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Order number card */}
        <div className="bg-white rounded-2xl border border-black-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-black-400 font-medium">Order number</p>
              <p className="text-2xl font-bold text-black-900 mt-0.5">
                #{order.order_number}
              </p>
            </div>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${brandColor}15` }}
            >
              <UtensilsCrossed size={20} style={{ color: brandColor }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-black-50 rounded-xl px-3 py-2.5">
              <p className="text-xs text-black-400 mb-0.5">Placed at</p>
              <p className="font-semibold text-black-900">{placedTime}</p>
            </div>
            <div className="bg-black-50 rounded-xl px-3 py-2.5">
              <p className="text-xs text-black-400 mb-0.5">
                {isDelivery ? "Est. delivery" : "Ready for pickup"}
              </p>
              <p className="font-semibold text-black-900">{eta ?? "—"}</p>
            </div>
          </div>
        </div>

        {/* Order items */}
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-100">
            <h2 className="font-bold text-black-900 text-sm">Your order</h2>
          </div>
          <div className="divide-y divide-black-50">
            {(order.order_items as Array<{
              id: string;
              item_name: string;
              item_price_kobo: number;
              quantity: number;
              line_total_kobo: number;
            }>).map((item) => (
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
          <div className="px-4 py-3 bg-black-50 space-y-2">
            {Number(order.subtotal_kobo) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">Subtotal</span>
                <span className="text-black-900">{formatKobo(Number(order.subtotal_kobo))}</span>
              </div>
            )}
            {isDelivery && Number(order.delivery_fee_kobo) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">Delivery fee</span>
                <span className="text-black-900">{formatKobo(Number(order.delivery_fee_kobo))}</span>
              </div>
            )}
            {Number(order.vat_kobo) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">VAT</span>
                <span className="text-black-900">{formatKobo(Number(order.vat_kobo))}</span>
              </div>
            )}
            {Number(order.service_fee_kobo) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-black-500">Service fee</span>
                <span className="text-black-900">{formatKobo(Number(order.service_fee_kobo))}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm border-t border-black-100 pt-2">
              <span className="font-bold text-black-900">Total paid</span>
              <span className="font-bold text-black-900">{formatKobo(Number(order.total_kobo))}</span>
            </div>
          </div>
        </div>

        {/* Customer & delivery details */}
        <div className="bg-white rounded-2xl border border-black-100 p-5 space-y-3">
          <h2 className="font-bold text-black-900 text-sm">Order details</h2>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <Phone size={14} className="text-black-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-black-900 font-medium">{order.customer_name}</p>
                <p className="text-black-500">{order.customer_phone}</p>
              </div>
            </div>

            {isDelivery && order.delivery_address && (
              <div className="flex items-start gap-2.5">
                <MapPin size={14} className="text-black-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-black-500">Delivery to</p>
                  <p className="text-black-900 font-medium">{order.delivery_address}</p>
                </div>
              </div>
            )}

            {!isDelivery && (
              <div className="flex items-start gap-2.5">
                <Store size={14} className="text-black-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-black-500">Pickup from</p>
                  <p className="text-black-900 font-medium">{restaurant.address ?? restaurant.name}</p>
                </div>
              </div>
            )}

            {order.special_instructions && (
              <div className="bg-black-50 rounded-xl px-3 py-2.5">
                <p className="text-xs text-black-500 font-medium mb-1">Special instructions</p>
                <p className="text-sm text-black-600 italic">{order.special_instructions}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <Link
            href={`/${params.restaurant_slug}`}
            className="block w-full text-center py-3.5 rounded-2xl font-bold text-sm transition-colors"
            style={{ backgroundColor: brandColor, color: "#fff" }}
          >
            Return to store
          </Link>
          <Link
            href={`/${params.restaurant_slug}/orders/${order.id}`}
            className="block w-full text-center py-3.5 rounded-2xl font-semibold text-sm border border-black-200 text-black-700 hover:bg-black-50 transition-colors"
          >
            Track your order
          </Link>
        </div>
      </div>
    </div>
  );
}
