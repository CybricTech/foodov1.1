"use client";

import { useState } from "react";
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
  const [selectedItem, setSelectedItem] = useState<MenuItemWithOptions | null>(
    null
  );

  // Group items by category
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

  // Featured items
  const featured = items.filter((i) => i.is_featured);

  return (
    <>
      {/* Featured carousel */}
      {featured.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold text-black-900 mb-3">
            ⭐ Featured
          </h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
            {featured.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-64">
                <MenuItemCard
                  item={item}
                  onSelect={restaurantAcceptsOrders ? setSelectedItem : () => {}}
                />
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
          <section key={cat.id} id={`cat-${cat.id}`} className="mb-8">
            <h2 className="text-base font-bold text-black-900 mb-3">
              {cat.name}
            </h2>
            {cat.description && (
              <p className="text-xs text-black-400 mb-3">{cat.description}</p>
            )}
            <div className="grid grid-cols-1 gap-3">
              {catItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onSelect={restaurantAcceptsOrders ? setSelectedItem : () => {}}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Uncategorized items */}
      {uncategorized.length > 0 && (
        <section id="cat-uncategorized" className="mb-8">
          <h2 className="text-base font-bold text-black-900 mb-3">More</h2>
          <div className="grid grid-cols-1 gap-3">
            {uncategorized.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onSelect={restaurantAcceptsOrders ? setSelectedItem : () => {}}
              />
            ))}
          </div>
        </section>
      )}

      {/* Menu item bottom sheet */}
      <MenuItemSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* Floating cart bar */}
      <CartBar />
    </>
  );
}
