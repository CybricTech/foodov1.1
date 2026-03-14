/**
 * Order query helpers.
 */
import type { TypedSupabaseClient } from "../client";
import type { Order, OrderWithItems } from "../types";

/**
 * Fetch a single order with its items and delivery assignment.
 * Used on the order tracking page.
 */
export async function getOrderWithItems(
  client: TypedSupabaseClient,
  orderId: string
): Promise<OrderWithItems | null> {
  const { data, error } = await client
    .from("orders")
    .select(
      `
      *,
      items:order_items (*),
      delivery_assignment:delivery_assignments (*)
    `
    )
    .eq("id", orderId)
    .single();

  if (error || !data) return null;
  return data as unknown as OrderWithItems;
}

/**
 * Fetch all orders for a restaurant filtered by status.
 * Used in the Merchant Dashboard order queue.
 */
export async function getOrdersByStatus(
  client: TypedSupabaseClient,
  restaurantId: string,
  statuses: Order["status"][]
): Promise<Order[]> {
  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}

/**
 * Fetch today's completed orders for a restaurant.
 */
export async function getTodaysCompletedOrders(
  client: TypedSupabaseClient,
  restaurantId: string
): Promise<Order[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await client
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("status", ["delivered", "cancelled"])
    .gte("created_at", todayStart.toISOString())
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Order[];
}

/**
 * Update an order's status.
 * Always called server-side; RLS enforces restaurant_id scope.
 */
export async function updateOrderStatus(
  client: TypedSupabaseClient,
  orderId: string,
  status: Order["status"],
  extra?: Partial<Pick<Order, "cancelled_reason" | "delivered_at">>
): Promise<void> {
  const { error } = await client
    .from("orders")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", orderId);

  if (error) throw error;
}
