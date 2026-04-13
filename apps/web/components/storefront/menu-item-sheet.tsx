"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import { useCartStore } from "@/lib/stores/cart";
import { useRestaurant } from "./restaurant-context";
import type { MenuItemWithOptions, SelectedOptionSnapshot } from "@foodo/database";

interface MenuItemSheetProps {
  item: MenuItemWithOptions | null;
  onClose: () => void;
}

// choiceQtys: optionId → choiceId → quantity (0 means unselected)
type ChoiceQtys = Record<string, Record<string, number>>;

const MAX_CHOICE_QTY = 20;

export function MenuItemSheet({ item, onClose }: MenuItemSheetProps) {
  const { restaurant } = useRestaurant();
  const addItem = useCartStore((s) => s.addItem);

  const [quantity, setQuantity] = useState(1);
  const [choiceQtys, setChoiceQtys] = useState<ChoiceQtys>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [specialRequest, setSpecialRequest] = useState("");
  const [added, setAdded] = useState(false);

  // Reset state when item changes
  useEffect(() => {
    if (item) {
      setQuantity(1);
      const defaults: ChoiceQtys = {};
      item.options?.forEach((opt) => {
        defaults[opt.id] = {};
        // Pre-select the single required choice if there's only one
        if (opt.min_selections > 0 && opt.choices.length === 1) {
          defaults[opt.id][opt.choices[0].id] = 1;
        }
      });
      setChoiceQtys(defaults);
      setErrors({});
      setSpecialRequest("");
      setAdded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Trap scroll when open
  useEffect(() => {
    if (item) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [item]);

  if (!item) return null;

  /** For single-select groups: toggle choice on/off (qty 0 or 1). */
  function handleSingleSelect(optionId: string, choiceId: string) {
    setChoiceQtys((prev) => {
      const current = prev[optionId] ?? {};
      const already = current[choiceId] === 1;
      // Deselect all others, set this to 1 (or 0 if already selected)
      const next: Record<string, number> = {};
      if (!already) next[choiceId] = 1;
      return { ...prev, [optionId]: next };
    });
    setErrors((prev) => ({ ...prev, [optionId]: "" }));
  }

  /** For multi-select groups: set an explicit quantity for a choice. */
  function handleChoiceQty(optionId: string, choiceId: string, delta: number) {
    setChoiceQtys((prev) => {
      const current = prev[optionId] ?? {};
      const current_qty = current[choiceId] ?? 0;
      const next_qty = Math.max(0, Math.min(MAX_CHOICE_QTY, current_qty + delta));
      return {
        ...prev,
        [optionId]: { ...current, [choiceId]: next_qty },
      };
    });
    setErrors((prev) => ({ ...prev, [optionId]: "" }));
  }

  /** Sum of all choice quantities for a given option group. */
  function totalSelected(optionId: string): number {
    return Object.values(choiceQtys[optionId] ?? {}).reduce((s, q) => s + q, 0);
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    item!.options?.forEach((opt) => {
      const count = totalSelected(opt.id);
      if (count < opt.min_selections) {
        newErrors[opt.id] = `Please select at least ${opt.min_selections}`;
      }
      if (opt.max_selections && count > opt.max_selections) {
        newErrors[opt.id] = `Max ${opt.max_selections} selections`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function computeUnitPrice(): number {
    let price = item!.price_kobo;
    item!.options?.forEach((opt) => {
      const qtys = choiceQtys[opt.id] ?? {};
      opt.choices.forEach((choice) => {
        const qty = qtys[choice.id] ?? 0;
        if (qty > 0) price += (choice.price_modifier_kobo ?? 0) * qty;
      });
    });
    return price;
  }

  function buildSnapshot(): SelectedOptionSnapshot[] {
    return (item!.options ?? [])
      .map((opt) => {
        const qtys = choiceQtys[opt.id] ?? {};
        const selectedChoices = opt.choices
          .filter((c) => (qtys[c.id] ?? 0) > 0)
          .map((c) => ({
            choiceId: c.id,
            choiceName: c.name,
            priceModifierKobo: c.price_modifier_kobo ?? 0,
            quantity: qtys[c.id] ?? 1,
          }));
        return { optionId: opt.id, optionName: opt.name, choices: selectedChoices };
      })
      .filter((opt) => opt.choices.length > 0);
  }

  function handleAddToCart() {
    if (!item) return;
    if (!validate()) return;

    const snapshot = buildSnapshot();
    const unitPrice = computeUnitPrice();
    const req = specialRequest.trim();
    // Include quantities in key so 2× Extra Cheese is a different cart line than 1×
    const optionsKey =
      buildOptionsKeyWithQty(snapshot) + (req ? `|req:${req}` : "");

    addItem(restaurant.id, restaurant.slug, {
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.image_url ?? undefined,
      price: unitPrice,
      quantity,
      selectedOptions: snapshot,
      specialRequest: req || undefined,
      optionsKey,
    });

    setAdded(true);
    setTimeout(onClose, 700);
  }

  const unitPrice = computeUnitPrice();
  const totalPrice = unitPrice * quantity;

  const isSizedItem =
    item.price_kobo === 0 &&
    item.options?.some((o) => o.is_required && o.max_selections === 1);
  const minSizePrice = isSizedItem
    ? Math.min(
        ...(item.options?.flatMap((o) =>
          o.is_required && o.max_selections === 1
            ? o.choices.map((c) => c.price_modifier_kobo ?? 0)
            : []
        ) ?? [0])
      )
    : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black-900/50 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
        {/* Image */}
        {item.image_url && (
          <div className="relative w-full h-48 flex-shrink-0">
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover rounded-t-2xl"
              sizes="100vw"
              priority
            />
          </div>
        )}

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-black-200 rounded-full" />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <h2 className="text-xl font-bold text-black-900 mt-1">{item.name}</h2>
          {item.description && (
            <p className="mt-1 text-sm text-black-400">{item.description}</p>
          )}
          <p className="mt-2 text-lg font-bold text-primary">
            {isSizedItem
              ? `from ${formatKobo(minSizePrice)}`
              : formatKobo(item.price_kobo)}
          </p>

          {/* Options */}
          {item.options?.map((opt) => {
            // Radio only when required AND capped at exactly 1 (forced single pick, e.g. size/protein)
            const isSingleSelect = !!opt.is_required && opt.max_selections === 1;
            const isSizeGroup = isSizedItem && opt.is_required && isSingleSelect;
            const count = totalSelected(opt.id);

            return (
              <div key={opt.id} className="mt-5">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-semibold text-black-900 text-sm">{opt.name}</h3>
                  <div className="flex items-center gap-1.5">
                    {!isSingleSelect && opt.max_selections && (
                      <span className="text-xs text-black-400">
                        max {opt.max_selections}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        opt.min_selections > 0
                          ? "bg-cinnabar-100 text-cinnabar-500"
                          : "bg-black-100 text-black-400"
                      )}
                    >
                      {opt.min_selections > 0 ? "Required" : "Optional"}
                    </span>
                  </div>
                </div>
                {errors[opt.id] && (
                  <p className="text-xs text-cinnabar-500 mb-1">{errors[opt.id]}</p>
                )}

                <div className="space-y-2">
                  {opt.choices.map((choice) => {
                    const qty = choiceQtys[opt.id]?.[choice.id] ?? 0;
                    const isSelected = qty > 0;

                    if (isSingleSelect) {
                      // ── Radio-style row ──
                      return (
                        <label
                          key={choice.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-black-100 hover:border-black-200"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-4 h-4 border-2 rounded-full transition-colors flex-shrink-0",
                                isSelected
                                  ? "border-primary bg-primary"
                                  : "border-black-300"
                              )}
                            />
                            <span className="text-sm text-black-900">{choice.name}</span>
                          </div>
                          {(choice.price_modifier_kobo ?? 0) !== 0 && (
                            <span className="text-xs text-black-400 ml-2">
                              {isSizeGroup
                                ? formatKobo(choice.price_modifier_kobo ?? 0)
                                : `+${formatKobo(choice.price_modifier_kobo ?? 0)}`}
                            </span>
                          )}
                          <input
                            type="radio"
                            className="sr-only"
                            checked={isSelected}
                            onChange={() => handleSingleSelect(opt.id, choice.id)}
                          />
                        </label>
                      );
                    }

                    // ── Multi-select: quantity stepper row ──
                    const atMax =
                      opt.max_selections != null && count >= opt.max_selections && !isSelected;

                    return (
                      <div
                        key={choice.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-black-100"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-black-900">{choice.name}</span>
                          {(choice.price_modifier_kobo ?? 0) !== 0 && (
                            <span className="text-xs text-black-400 ml-2">
                              +{formatKobo(choice.price_modifier_kobo ?? 0)} each
                            </span>
                          )}
                        </div>

                        {/* Stepper */}
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {isSelected ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleChoiceQty(opt.id, choice.id, -1)}
                                className="w-7 h-7 rounded-full border border-black-200 flex items-center justify-center text-black-600 hover:border-black-400 transition-colors font-bold text-base leading-none"
                              >
                                −
                              </button>
                              <span className="w-5 text-center text-sm font-semibold text-black-900">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleChoiceQty(opt.id, choice.id, 1)}
                                disabled={atMax || qty >= MAX_CHOICE_QTY}
                                className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary/90 disabled:opacity-40 transition-colors font-bold text-base leading-none"
                              >
                                +
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={atMax}
                              onClick={() => handleChoiceQty(opt.id, choice.id, 1)}
                              className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white hover:bg-primary/90 disabled:opacity-40 transition-colors font-bold text-base leading-none"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Special requests */}
          <div className="mt-5 pt-5 border-t border-black-100">
            <h3 className="font-semibold text-black-900 text-sm mb-0.5">
              Special requests
            </h3>
            <p className="text-xs text-black-400 mb-3">
              We&apos;ll try our best to accommodate requests, but can&apos;t
              make changes that affect pricing.
            </p>
            <textarea
              value={specialRequest}
              onChange={(e) => setSpecialRequest(e.target.value)}
              placeholder="Add special request"
              rows={3}
              maxLength={300}
              className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 placeholder:text-black-400 focus:outline-none focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* Footer: Quantity + Add to Cart */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-black-100 bg-white">
          <div className="flex items-center gap-4">
            {/* Quantity stepper */}
            <div className="flex items-center gap-2 bg-black-50 rounded-xl px-3 py-2">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-6 h-6 flex items-center justify-center text-black-500 hover:text-black-900 font-bold text-lg"
              >
                −
              </button>
              <span className="w-6 text-center font-semibold text-black-900 text-sm">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-6 h-6 flex items-center justify-center text-primary hover:text-primary/80 font-bold text-lg"
              >
                +
              </button>
            </div>

            {/* Add to cart */}
            <button
              onClick={handleAddToCart}
              disabled={added}
              className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-90 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-between px-4"
            >
              <span>{added ? "Added ✓" : "Add to cart"}</span>
              <span>{formatKobo(totalPrice)}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Like buildOptionsKey but includes quantities so 2× Extra Cheese ≠ 1× Extra Cheese. */
function buildOptionsKeyWithQty(snapshot: SelectedOptionSnapshot[]): string {
  const parts = snapshot.flatMap((opt) =>
    opt.choices.map(
      (c) => `${opt.optionId}:${c.choiceId}:${c.quantity ?? 1}`
    )
  );
  return parts.sort().join("|") || "no-options";
}
