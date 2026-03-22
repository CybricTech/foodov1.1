"use client";

import Image from "next/image";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import type { MenuItemWithOptions } from "@foodo/database";

interface MenuItemCardProps {
  item: MenuItemWithOptions;
  onSelect: (item: MenuItemWithOptions) => void;
}

export function MenuItemCard({ item, onSelect }: MenuItemCardProps) {
  return (
    <button
      onClick={() => onSelect(item)}
      className={cn(
        "group flex gap-3 w-full text-left p-3 rounded-xl bg-white border border-black-100",
        "hover:border-primary/40 hover:shadow-sm transition-all",
        !item.is_available && "opacity-50 pointer-events-none"
      )}
    >
      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-black-900 text-sm leading-snug line-clamp-2">
          {item.name}
        </p>
        {item.description && (
          <p className="mt-0.5 text-xs text-black-400 line-clamp-2">
            {item.description}
          </p>
        )}
        <p className="mt-2 text-sm font-bold text-primary">
          {item.price_kobo === 0
            ? (() => {
                const sizeGroup = item.options?.find((o) => o.is_required && o.max_selections === 1);
                const first = sizeGroup?.choices[0];
                return first ? `from ${formatKobo(first.price_modifier_kobo ?? 0)}` : formatKobo(0);
              })()
            : formatKobo(item.price_kobo)}
        </p>
        {!item.is_available && (
          <span className="inline-block mt-1 text-xs text-cinnabar-500 font-medium">
            Unavailable
          </span>
        )}
      </div>

      {/* Image */}
      {item.image_url && (
        <div className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-black-100">
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="96px"
          />
          <div className="absolute inset-0 flex items-end justify-end p-1.5">
            <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-lg font-bold leading-none">
              +
            </span>
          </div>
        </div>
      )}

      {!item.image_url && (
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center self-center">
          <span className="text-primary text-xl font-bold">+</span>
        </div>
      )}
    </button>
  );
}
