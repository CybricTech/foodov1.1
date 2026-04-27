"use client";

import { useState, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import {
  Search,
  UtensilsCrossed,
  Star,
  X,
} from "lucide-react";
import type { MenuCategory } from "@foodo/database";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price_kobo: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  category_id: string | null;
}

interface FrontlineMenuClientProps {
  restaurantId: string;
  initialCategories: MenuCategory[];
  initialItems: MenuItem[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FrontlineMenuClient({
  restaurantId: _restaurantId,
  initialCategories,
  initialItems,
}: FrontlineMenuClientProps) {
  const supabase = createBrowserClient();
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function toggleAvailability(itemId: string, current: boolean) {
    setToggling(itemId);
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, is_available: !current } : i))
    );

    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: !current })
      .eq("id", itemId);

    if (error) {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, is_available: current } : i))
      );
    }
    setToggling(null);
  }

  const filteredItems = useMemo(() => {
    let result = items;

    if (activeCategory) {
      result = result.filter((i) => i.category_id === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }

    return result;
  }, [items, search, activeCategory]);

  const availableCount = filteredItems.filter((i) => i.is_available).length;
  const unavailableCount = filteredItems.length - availableCount;

  return (
    <div className="min-h-screen bg-black-50">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-black-900 tracking-tight">
              Menu
            </h1>
            <p className="text-xs text-black-400 mt-0.5">
              {availableCount} available &middot; {unavailableCount} unavailable
            </p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mt-3">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black-300"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items…"
            className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-black-200 bg-black-50 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors placeholder:text-black-300"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-black-300 hover:text-black-500 cursor-pointer"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category filter pills */}
        {initialCategories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 -mx-4 px-4 pb-0.5">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap",
                !activeCategory
                  ? "bg-purple-500 text-white"
                  : "bg-black-100 text-black-500 hover:bg-black-200"
              )}
            >
              All items
            </button>
            {initialCategories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap",
                    isActive
                      ? "bg-purple-500 text-white"
                      : "bg-black-100 text-black-500 hover:bg-black-200"
                  )}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="p-4 md:p-6">
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-black-100 flex items-center justify-center mb-3">
                <UtensilsCrossed size={22} className="text-black-300" />
              </div>
              <p className="text-sm font-semibold text-black-500">
                {search ? "No items match your search" : "No menu items yet"}
              </p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-2 text-xs font-medium text-purple-500 hover:text-purple-400 cursor-pointer"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-black-50">
              {filteredItems.map((item) => {
                const categoryName =
                  initialCategories.find((c) => c.id === item.category_id)
                    ?.name ?? null;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 transition-colors duration-150",
                      !item.is_available && "bg-black-50/40"
                    )}
                  >
                    {/* Thumbnail */}
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className={cn(
                          "w-12 h-12 rounded-xl object-cover flex-shrink-0",
                          !item.is_available && "grayscale opacity-60"
                        )}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-black-100 flex items-center justify-center flex-shrink-0">
                        <UtensilsCrossed
                          size={18}
                          className="text-black-300"
                        />
                      </div>
                    )}

                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p
                          className={cn(
                            "text-sm font-semibold leading-tight truncate",
                            item.is_available
                              ? "text-black-900"
                              : "text-black-400"
                          )}
                        >
                          {item.name}
                        </p>
                        {item.is_featured && (
                          <Star
                            size={11}
                            className="text-amber-400 fill-amber-400 flex-shrink-0"
                          />
                        )}
                        {!item.is_available && (
                          <span className="flex-shrink-0 text-[10px] font-semibold text-cinnabar-500 bg-cinnabar-50 px-1.5 py-0.5 rounded-full">
                            Unavailable
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-black-500 font-medium">
                          {item.price_kobo === 0
                            ? "Multiple sizes"
                            : formatKobo(item.price_kobo)}
                        </p>
                        {categoryName && (
                          <>
                            <span className="text-black-200 text-xs">
                              &middot;
                            </span>
                            <span className="text-[11px] text-black-400">
                              {categoryName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Toggle switch */}
                    <button
                      onClick={() =>
                        toggleAvailability(item.id, item.is_available)
                      }
                      disabled={toggling === item.id}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 disabled:opacity-50",
                        item.is_available ? "bg-viridian-500" : "bg-black-200"
                      )}
                      title={
                        item.is_available
                          ? "Mark unavailable"
                          : "Mark available"
                      }
                      aria-label={`Toggle ${item.name} availability`}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200",
                          item.is_available
                            ? "translate-x-[20px]"
                            : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
