/**
 * CRM customer query helpers.
 */
import type { TypedSupabaseClient } from "../client";
import type { Customer, CustomerWithOrders } from "../custom-types";

/**
 * Look up a customer by phone number for a specific restaurant.
 * Used during checkout for returning customer pre-fill.
 */
export async function getCustomerByPhone(
  client: TypedSupabaseClient,
  restaurantId: string,
  phone: string
): Promise<Pick<Customer, "full_name" | "email"> | null> {
  const { data, error } = await client
    .from("customers")
    .select("full_name, email")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Fetch all customers for a restaurant, sorted by total_spent DESC.
 * Used in the Merchant Dashboard CRM table.
 */
export async function getCustomers(
  client: TypedSupabaseClient,
  restaurantId: string,
  sort: "total_spent" | "last_order_at" | "first_order_at" = "total_spent"
): Promise<Customer[]> {
  const sortConfig: Record<typeof sort, { column: string; ascending: boolean }> = {
    total_spent: { column: "total_spent", ascending: false },
    last_order_at: { column: "last_order_at", ascending: false },
    first_order_at: { column: "first_order_at", ascending: true },
  };

  const { column, ascending } = sortConfig[sort];

  const { data, error } = await client
    .from("customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order(column, { ascending });

  if (error) throw error;
  return (data ?? []) as unknown as Customer[];
}

/**
 * Fetch a customer with their order history.
 * Used in the customer detail modal.
 */
export async function getCustomerWithOrders(
  client: TypedSupabaseClient,
  customerId: string
): Promise<CustomerWithOrders | null> {
  const { data, error } = await client
    .from("customers")
    .select(
      `
      *,
      orders (
        id,
        order_number,
        total_amount,
        status,
        created_at
      )
    `
    )
    .eq("id", customerId)
    .single();

  if (error || !data) return null;
  return data as unknown as CustomerWithOrders;
}

/**
 * Update merchant notes for a customer.
 */
export async function updateCustomerNotes(
  client: TypedSupabaseClient,
  customerId: string,
  notes: string
): Promise<void> {
  const { error } = await client
    .from("customers")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", customerId);

  if (error) throw error;
}
