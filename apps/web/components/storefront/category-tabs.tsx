"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@foodo/ui";
import type { MenuCategory } from "@foodo/database";

interface CategoryTabsProps {
  categories: MenuCategory[];
}

export function CategoryTabs({ categories }: CategoryTabsProps) {
  const [activeId, setActiveId] = useState<string>(categories[0]?.id ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);

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
      const offset = 80; // height of sticky tabs bar
      const top =
        section.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    setActiveId(id);

    // Scroll the active tab into view within the tabs container
    const tab = tabsRef.current?.querySelector(`[data-id="${id}"]`);
    tab?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-black-100 shadow-sm">
      <div
        ref={tabsRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide px-4 py-2"
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            data-id={cat.id}
            onClick={() => scrollToCategory(cat.id)}
            className={cn(
              "flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              activeId === cat.id
                ? "bg-primary text-white"
                : "bg-black-100 text-black-500 hover:bg-black-200"
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
