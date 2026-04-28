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
  const unavailable = !item.is_available;

  return (
    <button
      onClick={() => !unavailable && onSelect(item)}
      disabled={unavailable}
      className={cn(
        "group flex gap-3 w-full text-left p-3 rounded-xl bg-white border border-black-100 transition-all",
        unavailable
          ? "cursor-default"
          : "hover:border-primary/40 hover:shadow-sm cursor-pointer"
      )}
    >
      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p
            className={cn(
              "font-semibold text-sm leading-snug line-clamp-2",
              unavailable ? "text-black-400" : "text-black-900"
            )}
          >
            {item.name}
          </p>
          {unavailable && (
            <span className="flex-shrink-0 text-[10px] font-semibold text-black-400 bg-black-100 px-1.5 py-0.5 rounded-full">
              Unavailable
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-black-400 line-clamp-2">
            {item.description}
          </p>
        )}
        <p
          className={cn(
            "mt-2 text-sm font-bold",
            unavailable ? "text-black-300" : "text-primary"
          )}
        >
          {item.price_kobo === 0
            ? (() => {
                const sizeGroup = item.options?.find(
                  (o) => o.is_required && o.max_selections === 1
                );
                const first = sizeGroup?.choices[0];
                return first
                  ? `from ${formatKobo(first.price_modifier_kobo ?? 0)}`
                  : formatKobo(0);
              })()
            : formatKobo(item.price_kobo)}
        </p>
      </div>

      {/* Image */}
      {item.image_url ? (
        <div className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-black-100">
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            unoptimized
            className={cn(
              "object-cover transition-transform duration-300",
              unavailable ? "grayscale" : "group-hover:scale-105"
            )}
            sizes="96px"
          />
          {!unavailable && (
            <div className="absolute inset-0 flex items-end justify-end p-1.5">
              <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-lg font-bold leading-none">
                +
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center self-center",
            unavailable ? "bg-black-100" : "bg-primary/10"
          )}
        >
          {!unavailable && (
            <span className="text-primary text-xl font-bold">+</span>
          )}
        </div>
      )}
    </button>
  );
}
