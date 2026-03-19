"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { formatKobo } from "@foodo/utils";
import { useCartStore } from "@/lib/stores/cart";

interface CartSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CartSheet({ open, onClose }: CartSheetProps) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotalKobo)();
  const slug = useCartStore((s) => s.restaurantSlug);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  // Trap scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  function handleCheckout() {
    onClose();
    router.push(`/${slug}/checkout`);
  }

  // Summarise selected options into a readable string
  function optionsSummary(item: typeof items[number]) {
    const parts = item.selectedOptions.flatMap((opt) =>
      opt.choices.map((c) => c.choiceName)
    );
    return parts.join(", ");
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black-900/50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-h-[92vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-black-900">Cart</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black-100 flex items-center justify-center text-black-500 hover:bg-black-200 transition-colors"
            aria-label="Close cart"
          >
            ✕
          </button>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {items.map((item) => {
            const summary = optionsSummary(item);
            return (
              <div
                key={item.optionsKey}
                className="flex items-start gap-3 px-5 py-4 border-b border-black-100"
              >
                {/* Thumbnail */}
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-black-100"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-black-100 flex-shrink-0 flex items-center justify-center text-2xl">
                    🍽
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-black-900 leading-snug">
                    {item.name}
                  </p>
                  {summary && (
                    <p className="text-xs text-black-400 mt-0.5 truncate">{summary}</p>
                  )}
                  {item.specialRequest && (
                    <p className="text-xs text-black-400 mt-0.5 italic truncate">
                      &ldquo;{item.specialRequest}&rdquo;
                    </p>
                  )}

                  {/* Quantity stepper */}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-2 border border-black-200 rounded-xl px-3 py-1.5">
                      <button
                        onClick={() =>
                          updateQuantity(item.menuItemId, item.optionsKey, item.quantity - 1)
                        }
                        className="w-5 h-5 flex items-center justify-center text-black-500 font-bold text-base leading-none"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-black-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.menuItemId, item.optionsKey, item.quantity + 1)
                        }
                        className="w-5 h-5 flex items-center justify-center text-primary font-bold text-base leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Line total */}
                <p className="text-sm font-bold text-black-900 flex-shrink-0 pt-0.5">
                  {formatKobo(item.lineTotal)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 pt-4 pb-6 border-t border-black-100 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-black-900">Subtotal</span>
            <span className="text-base font-bold text-black-900">{formatKobo(subtotal)}</span>
          </div>
          <button
            onClick={handleCheckout}
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            Go to checkout
            <span className="text-base">›</span>
          </button>
        </div>
      </div>
    </>
  );
}
