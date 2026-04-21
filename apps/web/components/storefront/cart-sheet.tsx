"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, UtensilsCrossed, ArrowRight, Minus, Plus } from "lucide-react";
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

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  function handleCheckout() {
    onClose();
    router.push(`/${slug}/checkout`);
  }

  function optionsSummary(item: typeof items[number]) {
    const parts = item.selectedOptions.flatMap((opt) =>
      opt.choices.map((c) =>
        (c.quantity ?? 1) > 1 ? `${c.quantity}× ${c.choiceName}` : c.choiceName
      )
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
          <div>
            <h2 className="text-xl font-bold text-black-900">Your cart</h2>
            <p className="text-xs text-black-400 mt-0.5">
              {items.reduce((s, i) => s + i.quantity, 0)} item{items.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black-100 flex items-center justify-center text-black-500 hover:bg-black-200 transition-colors cursor-pointer"
            aria-label="Close cart"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto divide-y divide-black-50">
          {items.map((item) => {
            const summary = optionsSummary(item);
            return (
              <div
                key={item.optionsKey}
                className="flex items-start gap-3 px-5 py-4"
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
                  <div className="w-14 h-14 rounded-xl bg-black-50 flex-shrink-0 flex items-center justify-center">
                    <UtensilsCrossed size={20} className="text-black-200" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-black-900 leading-snug">
                    {item.name}
                  </p>
                  {summary && (
                    <p className="text-xs text-black-400 mt-0.5 line-clamp-1">{summary}</p>
                  )}
                  {item.specialRequest && (
                    <p className="text-xs text-black-400 mt-0.5 italic line-clamp-1">
                      &ldquo;{item.specialRequest}&rdquo;
                    </p>
                  )}

                  {/* Quantity stepper */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center gap-1 border border-black-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() =>
                          updateQuantity(item.menuItemId, item.optionsKey, item.quantity - 1)
                        }
                        className="w-8 h-8 flex items-center justify-center text-black-500 hover:bg-black-50 transition-colors cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-black-900 select-none">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(item.menuItemId, item.optionsKey, item.quantity + 1)
                        }
                        className="w-8 h-8 flex items-center justify-center text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus size={13} />
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
            <span className="text-base font-semibold text-black-600">Subtotal</span>
            <span className="text-base font-bold text-black-900">{formatKobo(subtotal)}</span>
          </div>
          <button
            onClick={handleCheckout}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            Go to checkout
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
