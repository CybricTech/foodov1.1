import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { readPaymentLink, verifyPaymentLinkItems } from "@/lib/payment-links";
import CheckoutClient from "@/components/storefront/checkout-client";
import { PaymentLinkResume } from "@/components/storefront/payment-link-resume";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your prepared order", robots: { index: false, follow: false }, referrer: "no-referrer",
  openGraph: { title: "Your order is ready to review", description: "Confirm your details and pay securely with Kitchyn." },
};

export default async function PaymentLinkPage({ params }: { params: { restaurant_slug: string; token: string } }) {
  const db = createServiceClient();
  const { data: restaurant } = await db.from("restaurants").select("id, name, slug").eq("slug", params.restaurant_slug).eq("is_active", true).maybeSingle();
  if (!restaurant) notFound();
  const found = await readPaymentLink(db, params.token, restaurant.id);
  if (!found) notFound();
  if (found.payment) return <PaymentLinkResume token={params.token} restaurantId={restaurant.id} restaurantSlug={restaurant.slug} restaurantName={restaurant.name} />;
  let unavailable = found.status === "cancelled" ? "The restaurant has cancelled this payment link." : found.status === "expired" ? "This payment link has expired." : "";
  let items;
  if (!unavailable) {
    try { items = await verifyPaymentLinkItems(db, found.link); }
    catch (error) { unavailable = error instanceof Error ? error.message : "Unable to check your order. Please try again."; }
  }
  if (unavailable || !items) return <main className="mx-auto max-w-lg px-6 py-20 text-center"><h1 className="text-2xl font-bold">This order needs an update</h1><p className="mt-4 text-black-500">{unavailable} Please contact {restaurant.name} before paying.</p><Link className="mt-6 inline-block underline" href={`/${restaurant.slug}`}>Visit the restaurant</Link></main>;
  // No live payment but attempts on record means every one was refused, so this
  // is a retry rather than a first visit.
  return <CheckoutClient preparedLink={{ token: params.token, customerName: found.link.customer_name, items, retrying: found.attempts.length > 0 }} />;
}
