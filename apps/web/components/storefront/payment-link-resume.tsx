"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatKobo } from "@foodo/utils";

interface PaymentSession {
  status: string; orderId: string | null; totalKobo: number; provider: string; reference: string;
  session: { checkoutUrl?: string; paymentId: string } | null;
  customerName: string; customerPhone: string; customerEmail: string | null;
  deliveryAddress: string | null; fulfillmentType: string;
}

export function PaymentLinkResume({ token, restaurantId, restaurantSlug, restaurantName }: { token: string; restaurantId: string; restaurantSlug: string; restaurantName: string }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    const response = await fetch("/api/checkout/payment-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, restaurantId }) });
    const data = await response.json();
    // The attempt this screen was tracking has been refused; the link now takes
    // a fresh one, so reload into the prepared checkout instead of arguing here.
    if (data?.reopenPaymentLink) { window.location.reload(); return new Promise<PaymentSession>(() => {}); }
    if (!response.ok) throw new Error(data.error || "Unable to check payment.");
    setPayment(data);
    return data as PaymentSession;
  }, [token, restaurantId]);
  useEffect(() => { void read().catch((e) => setError(e.message)); }, [read]);
  function track(current: PaymentSession) {
    router.push(current.orderId ? `/${restaurantSlug}/orders/${current.orderId}` : `/${restaurantSlug}/orders/pending?ref=${encodeURIComponent(current.reference)}&provider=${current.provider}`);
  }
  async function resume() {
    setBusy(true); setError("");
    try {
      const current = await read();
      if (current.status === "paid") { track(current); return; }
      if (!current.session) throw new Error("Your payment is still being set up. Check its status before trying again. If this persists, contact the restaurant.");
      if (!current.session.checkoutUrl) throw new Error("Unable to resume payment. Please check its status or contact the restaurant.");
      window.location.assign(current.session.checkoutUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to resume payment."); setBusy(false); }
  }
  return <main className="mx-auto max-w-lg px-5 py-12">
    <div className="rounded-2xl border border-black-100 bg-white p-6 shadow-sm">
      <p className="text-sm text-black-500">{restaurantName}</p>
      <h1 className="mt-2 text-2xl font-bold">{payment?.status === "paid" ? "Your order is paid" : "Continue your payment"}</h1>
      <p className="mt-3 text-sm text-black-500">{payment?.status === "paid" ? "You can follow your order below." : "Your order details are saved. If you have already transferred, check payment status before paying again."}</p>
      {payment && <div className="my-6 space-y-2"><p className="text-3xl font-bold">{formatKobo(payment.totalKobo)}</p><p>{payment.customerName}</p><p className="text-sm text-black-500">{payment.fulfillmentType === "pickup" ? "Pickup at the restaurant" : payment.deliveryAddress}</p></div>}
      {error && <p role="alert" className="my-4 text-sm text-cinnabar-500">{error}</p>}
      <button disabled={busy} onClick={resume} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Opening payment…" : payment?.status === "paid" ? "Track order" : "Continue payment"}</button>
      {payment && payment.status !== "paid" && <button onClick={() => track(payment)} className="mt-3 w-full rounded-xl border border-black-200 px-5 py-3 font-semibold">Check payment status</button>}
    </div>
  </main>;
}
