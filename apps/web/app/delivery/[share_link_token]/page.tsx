import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";

interface DeliveryCardProps {
  params: { share_link_token: string };
}

export default async function DeliveryCardPage({ params }: DeliveryCardProps) {
  const supabase = await createServerClient();

  // Fetch assignment by token
  const { data: assignmentData } = await supabase
    .from("delivery_assignments")
    .select(
      `
      id,
      status,
      assigned_at,
      dispatch_type,
      order:orders (
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        special_instructions,
        total_kobo,
        status,
        order_items (id, item_name, quantity)
      ),
      restaurant:restaurants (name, phone, address)
    `
    )
    .eq("share_link_token", params.share_link_token)
    .single();

  const assignment = assignmentData as unknown as {
    id: string;
    status: string;
    assigned_at: string;
    dispatch_type: string;
    order: Record<string, unknown> | null;
    restaurant: Record<string, unknown> | null;
  } | null;

  if (!assignment) notFound();

  // Check token expiry (6 hours)
  const assignedAt = new Date(assignment.assigned_at);
  const expiresAt = new Date(assignedAt.getTime() + 6 * 60 * 60 * 1000);
  if (new Date() > expiresAt) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <p className="text-2xl mb-2">⏰</p>
          <p className="font-semibold text-black-900">This delivery link has expired</p>
          <p className="text-sm text-black-400 mt-1">Ask the merchant for a new link</p>
        </div>
      </div>
    );
  }

  const order = (assignment.order ?? {}) as Record<string, unknown>;
  const restaurant = (assignment.restaurant ?? {}) as Record<string, unknown>;
  const items = (order?.order_items as Array<{ id: string; item_name: string; quantity: number }>) ?? [];

  return (
    <div className="min-h-screen bg-black-50 p-4">
      <div className="max-w-sm mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          <div className="bg-primary px-4 py-3">
            <h1 className="text-white font-bold">
              Delivery #{order?.order_number as string}
            </h1>
            <p className="text-white/80 text-sm">
              {restaurant?.name as string}
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* Pickup */}
            <div>
              <p className="text-xs font-semibold text-black-400 uppercase tracking-wide mb-1">
                📍 Pickup from
              </p>
              <p className="text-sm font-medium text-black-900">
                {restaurant?.name as string}
              </p>
              {!!restaurant?.address && (
                <p className="text-sm text-black-500">{String(restaurant.address)}</p>
              )}
              {!!restaurant?.phone && (
                <a
                  href={`tel:${String(restaurant.phone)}`}
                  className="text-sm text-primary font-medium mt-1 block"
                >
                  📞 {String(restaurant.phone)}
                </a>
              )}
            </div>

            <div className="border-t border-black-100" />

            {/* Dropoff */}
            <div>
              <p className="text-xs font-semibold text-black-400 uppercase tracking-wide mb-1">
                🏠 Deliver to
              </p>
              <p className="text-sm font-medium text-black-900">
                {order?.customer_name as string}
              </p>
              <p className="text-sm text-black-500">
                {order?.delivery_address as string}
              </p>
              <a
                href={`tel:${order?.customer_phone as string}`}
                className="text-sm text-primary font-medium mt-1 block"
              >
                📞 {order?.customer_phone as string}
              </a>
            </div>

            {!!order?.special_instructions && (
              <>
                <div className="border-t border-black-100" />
                <div>
                  <p className="text-xs font-semibold text-black-400 uppercase tracking-wide mb-1">
                    📝 Instructions
                  </p>
                  <p className="text-sm text-black-900">
                    {String(order.special_instructions)}
                  </p>
                </div>
              </>
            )}

            <div className="border-t border-black-100" />

            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-black-400 uppercase tracking-wide mb-2">
                🛍 Items
              </p>
              {items.map((item) => (
                <p key={item.id} className="text-sm text-black-900">
                  {item.quantity}× {item.item_name}
                </p>
              ))}
              <p className="text-sm font-bold text-black-900 mt-2">
                Total: {formatKobo(order?.total_kobo as number)}
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-black-300">
          This link expires {expiresAt.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
