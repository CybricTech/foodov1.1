"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRestaurant } from "@/components/storefront/restaurant-context";
import { CheckCircle } from "lucide-react";

function PendingOrderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { restaurant } = useRestaurant();
  const ref = searchParams.get("ref");

  const [, setAttempts] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!ref) return;

    let timeout: ReturnType<typeof setTimeout>;

    async function poll() {
      const res = await fetch(`/api/checkout/status?ref=${encodeURIComponent(ref!)}`);
      const json = await res.json();

      if (json.orderId) {
        router.replace(`/${restaurant.slug}/orders/${json.orderId}`);
        return;
      }

      setAttempts((a) => {
        const next = a + 1;
        if (next >= 15) {
          setTimedOut(true);
          return next;
        }
        timeout = setTimeout(poll, 2000);
        return next;
      });
    }

    timeout = setTimeout(poll, 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return (
    <div className="min-h-screen bg-black-50 flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-white rounded-2xl border border-black-100 p-8 max-w-sm w-full space-y-5">

        {/* Success icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle size={36} className="text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-black-900">Payment successful!</h1>
          <p className="text-sm text-black-500">
            Your order has been received. We&apos;ll notify you as soon as the restaurant accepts it.
          </p>
        </div>

        {/* Order status */}
        <div className="bg-black-50 rounded-xl px-4 py-3 flex items-center gap-3">
          {timedOut ? (
            <>
              <div className="w-2 h-2 rounded-full bg-dixie-500 flex-shrink-0" />
              <p className="text-xs text-black-500 text-left">
                Taking a little longer than usual — you&apos;ll get an SMS confirmation shortly.
              </p>
            </>
          ) : (
            <>
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-black-500 text-left">
                Confirming your order with the restaurant…
              </p>
            </>
          )}
        </div>

        <button
          onClick={() => router.replace(`/${restaurant.slug}`)}
          className="w-full py-3 rounded-xl border border-black-200 text-sm font-medium text-black-600 hover:bg-black-50 transition-colors"
        >
          Back to menu
        </button>
      </div>
    </div>
  );
}

export default function PendingOrderPage() {
  return (
    <Suspense>
      <PendingOrderContent />
    </Suspense>
  );
}
