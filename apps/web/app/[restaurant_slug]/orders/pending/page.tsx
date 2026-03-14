"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/components/storefront/restaurant-context";

/**
 * Intermediate page shown after Paystack popup success callback.
 * Polls for the order_id by paystack_ref until the webhook processes it,
 * then redirects to the order tracking page.
 */
export default function PendingOrderPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { restaurant } = useRestaurant();
  const supabase = createBrowserClient();
  const ref = searchParams.get("ref");

  const [attempts, setAttempts] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref) {
      setFailed(true);
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;

    async function poll() {
      const { data } = await supabase
        .from("payments")
        .select("order_id")
        .eq("paystack_ref", ref!)
        .eq("paystack_status", "success")
        .maybeSingle();

      if (data?.order_id) {
        router.replace(`/${restaurant.slug}/orders/${data.order_id}`);
        return;
      }

      setAttempts((a) => a + 1);

      if (attempts >= 15) {
        // Give up after ~30 seconds
        setFailed(true);
        return;
      }

      timeout = setTimeout(poll, 2000);
    }

    poll();
    return () => clearTimeout(timeout);
  }, [ref, attempts]);

  if (failed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center gap-4">
        <p className="text-2xl">⚠️</p>
        <p className="text-black-900 font-semibold">
          Payment received, but order is taking longer than expected.
        </p>
        <p className="text-sm text-black-400">
          You will receive an SMS confirmation shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center gap-4">
      <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-black-900 font-semibold">Confirming your order…</p>
      <p className="text-sm text-black-400">This usually takes a few seconds.</p>
    </div>
  );
}
