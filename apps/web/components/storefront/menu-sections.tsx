"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { MenuItemCard } from "./menu-item-card";
import { MenuItemSheet } from "./menu-item-sheet";
import { CartBar } from "./cart-bar";
import type { MenuCategory, MenuItemWithOptions } from "@foodo/database";

interface MenuSectionsProps {
  categories: MenuCategory[];
  items: MenuItemWithOptions[];
  restaurantAcceptsOrders: boolean;
}

export function MenuSections({
  categories,
  items,
  restaurantAcceptsOrders,
}: MenuSectionsProps) {
  const [selectedItem, setSelectedItem] = useState<MenuItemWithOptions | null>(null);

  const itemsByCategory = new Map<string, MenuItemWithOptions[]>();
  const uncategorized: MenuItemWithOptions[] = [];

  items.forEach((item) => {
    if (item.category_id) {
      const list = itemsByCategory.get(item.category_id) ?? [];
      list.push(item);
      itemsByCategory.set(item.category_id, list);
    } else {
      uncategorized.push(item);
    }
  });

  const featured = items.filter((i) => i.is_featured && i.is_available);

  function handleSelect(item: MenuItemWithOptions) {
    if (restaurantAcceptsOrders) setSelectedItem(item);
  }

  return (
    <>
      {/* Featured strip */}
      {featured.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center gap-1.5 mb-3">
            <Star size={15} className="text-dixie-500" fill="currentColor" />
            <h2 className="text-base font-bold text-black-900">Featured</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
            {featured.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-64">
                <MenuItemCard item={item} onSelect={handleSelect} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Category sections */}
      {categories.map((cat) => {
        const catItems = itemsByCategory.get(cat.id) ?? [];
        if (catItems.length === 0) return null;
        return (
          <section key={cat.id} id={`cat-${cat.id}`} className="mb-8 scroll-mt-16">
            <h2 className="text-lg font-bold text-black-900 mb-1">{cat.name}</h2>
            {cat.description && (
              <p className="text-xs text-black-400 mb-3 leading-relaxed">{cat.description}</p>
            )}
            <div className="grid grid-cols-1 gap-3">
              {catItems.map((item) => (
                <MenuItemCard key={item.id} item={item} onSelect={handleSelect} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Uncategorized */}
      {uncategorized.length > 0 && (
        <section id="cat-uncategorized" className="mb-8 scroll-mt-16">
          <h2 className="text-lg font-bold text-black-900 mb-3">More</h2>
          <div className="grid grid-cols-1 gap-3">
            {uncategorized.map((item) => (
              <MenuItemCard key={item.id} item={item} onSelect={handleSelect} />
            ))}
          </div>
        </section>
      )}

      <MenuItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CartBar />
    </>
  );
}
