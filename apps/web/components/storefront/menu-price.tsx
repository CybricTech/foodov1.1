import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import { Percent } from "lucide-react";
import type { MenuItemWithOptions } from "@foodo/database";

/**
 * An active store-wide percentage sale, surfaced on the storefront menu.
 *
 * `conditional` is true when the offer has a minimum order or a fulfillment
 * restriction — in that case we DON'T strike individual item prices (it would
 * mislead, since a single item may not qualify); we only show the banner.
 */
export interface MenuSale {
  percentOff: number;
  conditional: boolean;
  /** Short, honest description, e.g. "20% off everything" or "20% off orders over ₦5,000". */
  label: string;
}

/** Resolve an item's headline price in kobo, accounting for sized ("from") items. */
export function itemPriceKobo(item: MenuItemWithOptions): {
  kobo: number;
  isFrom: boolean;
} {
  if (item.price_kobo === 0) {
    const sizeGroup = item.options?.find(
      (o) => o.is_required && o.max_selections === 1
    );
    const first = sizeGroup?.choices[0];
    return { kobo: first?.price_modifier_kobo ?? 0, isFrom: true };
  }
  return { kobo: item.price_kobo, isFrom: false };
}

/** Apply a whole-percent discount to a kobo amount. */
export function applyPercent(kobo: number, percentOff: number): number {
  return Math.round((kobo * (100 - percentOff)) / 100);
}

/** Should this item's price be struck through for the given sale? */
function itemIsOnSale(item: MenuItemWithOptions, sale: MenuSale | null): boolean {
  return !!sale && !sale.conditional && itemPriceKobo(item).kobo > 0;
}

interface ItemPriceProps {
  item: MenuItemWithOptions;
  sale: MenuSale | null;
  /** Tailwind classes for the headline (current) price. */
  className?: string;
  /** Muted state for unavailable items. */
  muted?: boolean;
}

/**
 * Item price line. When an unconditional store-wide sale is active it shows the
 * discounted price with the original struck through (color is never the only
 * cue — the struck price + lower number carry the meaning).
 */
export function ItemPrice({ item, sale, className, muted }: ItemPriceProps) {
  const { kobo, isFrom } = itemPriceKobo(item);
  const prefix = isFrom ? "from " : "";

  if (!itemIsOnSale(item, sale)) {
    return (
      <span className={cn(muted ? "text-black-300" : "text-primary", className)}>
        {prefix}
        {formatKobo(kobo)}
      </span>
    );
  }

  const newKobo = applyPercent(kobo, sale!.percentOff);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("text-primary", className)}>
        {prefix}
        {formatKobo(newKobo)}
      </span>
      <span className="text-[0.72em] font-medium text-black-400 line-through tabular-nums">
        {formatKobo(kobo)}
      </span>
    </span>
  );
}

/** Small "-20%" pill, brand-coloured, for overlaying on item imagery. */
export function SalePill({
  percentOff,
  className,
}: {
  percentOff: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5",
        "text-[10px] font-extrabold uppercase tracking-wide text-white",
        "bg-primary shadow-sm ring-1 ring-white/25",
        className
      )}
    >
      <Percent size={9} strokeWidth={3} className="-ml-0.5" />
      {percentOff}% off
    </span>
  );
}

/** Slim, branded promotional banner placed above a menu/featured section. */
export function SaleBanner({ sale }: { sale: MenuSale | null }) {
  if (!sale) return null;
  return (
    <div
      className="mx-5 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/[0.07] px-3.5 py-2.5"
      role="status"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white">
        <Percent size={15} strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight text-primary">{sale.label}</p>
        <p className="text-[11px] leading-tight text-black-400">
          Applied automatically at checkout
        </p>
      </div>
    </div>
  );
}
