"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@foodo/ui";
import type { MenuCategory } from "@foodo/database";

interface CategoryTabsProps {
  categories: MenuCategory[];
  /** Categories whose items are all switched off — shown muted. */
  soldOutCategoryIds?: string[];
}

export function CategoryTabs({
  categories,
  soldOutCategoryIds = [],
}: CategoryTabsProps) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);
  const soldOut = new Set(soldOutCategoryIds);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    categories.forEach((cat) => {
      const section = document.getElementById(`cat-${cat.id}`);
      if (!section) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(cat.id);
        },
        { rootMargin: "-30% 0px -65% 0px" }
      );

      observer.observe(section);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  function scrollToCategory(id: string) {
    const section = document.getElementById(`cat-${id}`);
    if (section) {
      const offset = 80;
      const top = section.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setActiveId(id);

    const tab = tabsRef.current?.querySelector(`[data-id="${id}"]`);
    tab?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-black-100 shadow-sm">
      <div
        ref={tabsRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-hide px-4 py-2.5"
      >
        {categories.map((cat) => {
          const isSoldOut = soldOut.has(cat.id);
          const isActive = activeId === cat.id && !isSoldOut;
          return (
            <button
              key={cat.id}
              type="button"
              data-id={cat.id}
              onClick={() => !isSoldOut && scrollToCategory(cat.id)}
              aria-disabled={isSoldOut || undefined}
              aria-label={isSoldOut ? `${cat.name} — sold out` : undefined}
              className={cn(
                // min-h keeps a comfortable touch target on iOS/Android.
                "flex-shrink-0 inline-flex items-center min-h-[38px] px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-150",
                isActive
                  ? "bg-primary text-white shadow-sm cursor-pointer"
                  : isSoldOut
                    // Sold out → soft dashed "ghost" chip: muted and clearly
                    // unavailable without a strikethrough, and not tappable.
                    ? "border border-dashed border-black-200 bg-black-50 text-black-400 cursor-default"
                    : "bg-black-100 text-black-500 hover:bg-black-200 hover:text-black-900 cursor-pointer"
              )}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
