"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, Clock, ArrowLeft } from "lucide-react";
import { useRestaurant } from "@/components/storefront/restaurant-context";

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
      try {
        const res = await fetch(`/api/checkout/status?ref=${encodeURIComponent(ref!)}`);
        // res.json() can throw when the server returns a non-JSON body (e.g. a
        // 502 HTML error page), so parse inside the try block as well.
        let json: Record<string, unknown>;
        try {
          json = await res.json();
        } catch {
          // JSON parse failure — treat as a transient error and keep polling.
          setAttempts((a) => {
            const next = a + 1;
            if (next >= 90) {
              setTimedOut(true);
              return next;
            }
            timeout = setTimeout(poll, 2000);
            return next;
          });
          return;
        }

        if (json.orderId) {
          try {
            localStorage.setItem(
              `kitchyn:lastOrder:${restaurant.slug}`,
              JSON.stringify({ orderId: json.orderId, savedAt: Date.now() })
            );
          } catch {}
          router.replace(`/${restaurant.slug}/orders/success/${json.orderId}`);
          return;
        }

        setAttempts((a) => {
          const next = a + 1;
          if (next >= 90) {
            setTimedOut(true);
            return next;
          }
          timeout = setTimeout(poll, 2000);
          return next;
        });
      } catch {
        // Network error (fetch threw) — increment the attempt counter so the
        // loop eventually times out, but keep retrying in case it is a brief
        // connectivity blip.
        setAttempts((a) => {
          const next = a + 1;
          if (next >= 90) {
            setTimedOut(true);
            return next;
          }
          timeout = setTimeout(poll, 2000);
          return next;
        });
      }
    }

    timeout = setTimeout(poll, 2000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return (
    <div className="min-h-screen bg-black-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-black-100 p-8 max-w-sm w-full space-y-6 shadow-sm">

        {/* Success icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle size={40} className="text-primary" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold text-black-900">Payment successful!</h1>
          <p className="text-sm text-black-500 leading-relaxed">
            Your order has been received. We&apos;ll notify you as soon as the restaurant accepts it.
          </p>
        </div>

        {/* Polling status */}
        <div className="bg-black-50 rounded-xl px-4 py-3.5 flex items-center gap-3">
          {timedOut ? (
            <>
              <Clock size={16} className="text-dixie-500 flex-shrink-0" />
              <p className="text-xs text-black-500 text-left leading-relaxed">
                Taking a little longer than usual — you&apos;ll get an SMS confirmation shortly.
              </p>
            </>
          ) : (
            <>
              <Loader2 size={16} className="animate-spin text-primary flex-shrink-0" />
              <p className="text-xs text-black-500 text-left">
                Confirming your order with the restaurant…
              </p>
            </>
          )}
        </div>

        <button
          onClick={() => router.replace(`/${restaurant.slug}`)}
          className="w-full py-3 rounded-xl border border-black-200 text-sm font-medium text-black-600 hover:bg-black-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft size={14} />
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
