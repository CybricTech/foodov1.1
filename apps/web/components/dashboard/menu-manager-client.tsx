"use client";

import { useState, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import { MENU_IMAGE_MAX_SIZE_BYTES } from "@foodo/utils";
import { cn } from "@foodo/ui";
import type { MenuCategory, MenuItemWithOptions } from "@foodo/database";

interface MenuManagerClientProps {
  restaurantId: string;
  initialCategories: MenuCategory[];
  initialItems: MenuItemWithOptions[];
}

export function MenuManagerClient({
  restaurantId,
  initialCategories,
  initialItems,
}: MenuManagerClientProps) {
  const supabase = createBrowserClient();
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [editingItem, setEditingItem] = useState<MenuItemWithOptions | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategories[0]?.id ?? null
  );

  async function toggleAvailable(itemId: string, current: boolean) {
    await supabase
      .from("menu_items")
      .update({ is_available: !current })
      .eq("id", itemId);
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, is_available: !current } : i
      )
    );
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Delete this menu item?")) return;
    await supabase.from("menu_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  const categoryItems = items.filter(
    (i) => i.category_id === activeCategory
  );

  return (
    <div className="md:p-6 pb-24">
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 flex justify-between items-center">
        <h1 className="font-bold text-black-900 text-lg">Menu</h1>
        <button
          onClick={() => setShowAddItem(true)}
          className="bg-viridian-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-viridian-500/90 transition-colors"
        >
          + Add item
        </button>
      </div>

      <div className="flex mt-0 md:mt-4">
        {/* Category list */}
        <div className="w-40 flex-shrink-0 border-r border-black-100 bg-white md:rounded-l-2xl md:border md:border-r-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "w-full text-left px-3 py-3 text-sm border-b border-black-50 transition-colors",
                activeCategory === cat.id
                  ? "bg-viridian-500/10 text-viridian-500 font-semibold"
                  : "text-black-500 hover:bg-black-50"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Items in category */}
        <div className="flex-1 bg-white md:rounded-r-2xl md:border md:border-l-0 border-black-100 overflow-hidden">
          {categoryItems.length === 0 && (
            <div className="py-12 text-center text-black-400">
              <p className="text-2xl mb-2">🍽️</p>
              <p className="text-sm">No items in this category</p>
            </div>
          )}
          {categoryItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-black-50 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    item.is_available ? "text-black-900" : "text-black-300"
                  )}
                >
                  {item.name}
                </p>
                <p className="text-xs text-black-400">
                  {formatKobo(item.price_kobo)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Toggle available */}
                <button
                  onClick={() => toggleAvailable(item.id, item.is_available)}
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-colors",
                    item.is_available ? "bg-viridian-500" : "bg-black-200"
                  )}
                  title={item.is_available ? "Available" : "Unavailable"}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                      item.is_available ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
                <button
                  onClick={() => setEditingItem(item)}
                  className="text-xs text-black-400 hover:text-black-900 px-2 py-1 rounded-lg hover:bg-black-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-xs text-cinnabar-500 hover:text-cinnabar-600 px-2 py-1 rounded-lg hover:bg-cinnabar-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Edit item modal */}
      {(showAddItem || editingItem) && (
        <ItemFormModal
          restaurantId={restaurantId}
          categories={categories}
          item={editingItem}
          defaultCategoryId={activeCategory}
          onClose={() => {
            setShowAddItem(false);
            setEditingItem(null);
          }}
          onSave={(savedItem) => {
            if (editingItem) {
              setItems((prev) =>
                prev.map((i) => (i.id === savedItem.id ? savedItem : i))
              );
            } else {
              setItems((prev) => [...prev, savedItem]);
            }
            setShowAddItem(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

interface ItemFormModalProps {
  restaurantId: string;
  categories: MenuCategory[];
  item: MenuItemWithOptions | null;
  defaultCategoryId: string | null;
  onClose: () => void;
  onSave: (item: MenuItemWithOptions) => void;
}

function ItemFormModal({
  restaurantId,
  categories,
  item,
  defaultCategoryId,
  onClose,
  onSave,
}: ItemFormModalProps) {
  const supabase = createBrowserClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [priceNgn, setPriceNgn] = useState(
    item ? (item.price_kobo / 100).toString() : ""
  );
  const [categoryId, setCategoryId] = useState(
    item?.category_id ?? defaultCategoryId ?? ""
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(
    item?.image_url ?? ""
  );
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MENU_IMAGE_MAX_SIZE_BYTES) {
      setError(
        `Image must be under ${MENU_IMAGE_MAX_SIZE_BYTES / 1024}KB. Please compress it first.`
      );
      return;
    }
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!priceNgn || isNaN(parseFloat(priceNgn))) { setError("Valid price required"); return; }
    setSaving(true);
    setError("");

    try {
      let imageUrl = item?.image_url ?? null;

      if (imageFile) {
        const path = `${restaurantId}/${Date.now()}-${imageFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("menu-images")
          .upload(path, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
          .from("menu-images")
          .getPublicUrl(path);
        imageUrl = publicUrl;
      }

      const payload = {
        restaurant_id: restaurantId,
        name: name.trim(),
        description: description.trim() || null,
        price_kobo: Math.round(parseFloat(priceNgn) * 100),
        category_id: categoryId || null,
        image_url: imageUrl,
        is_featured: isFeatured,
      };

      let result: MenuItemWithOptions;

      if (item) {
        const { data, error: updateError } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", item.id)
          .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
          .single();
        if (updateError) throw updateError;
        result = data as unknown as MenuItemWithOptions;
      } else {
        const { data, error: insertError } = await supabase
          .from("menu_items")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ ...payload, display_order: 0, price: payload.price_kobo } as any)
          .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
          .single();
        if (insertError) throw insertError;
        result = data as unknown as MenuItemWithOptions;
      }

      onSave(result);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black-900/50">
      <div className="bg-white w-full max-w-lg md:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-black-100">
          <h2 className="font-bold text-black-900">
            {item ? "Edit item" : "Add menu item"}
          </h2>
          <button onClick={onClose} className="text-black-400 hover:text-black-900">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
              placeholder="e.g. Jollof Rice"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
              placeholder="Short description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-black-500 mb-1">Price (₦)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceNgn}
                onChange={(e) => setPriceNgn(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
                placeholder="1500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black-500 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500 bg-white"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">
              Image (max 80KB)
            </label>
            <div
              className="border-2 border-dashed border-black-200 rounded-xl p-4 text-center cursor-pointer hover:border-viridian-500 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-32 object-cover rounded-lg"
                />
              ) : (
                <p className="text-sm text-black-400">Click to upload image</p>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="w-4 h-4 accent-viridian-500"
            />
            <span className="text-sm text-black-900">Featured item</span>
          </label>

          {error && (
            <p className="text-sm text-cinnabar-500">{error}</p>
          )}
        </div>

        <div className="px-4 py-4 border-t border-black-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-viridian-500 hover:bg-viridian-500/90 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : item ? "Save changes" : "Add item"}
          </button>
        </div>
      </div>
    </div>
  );
}
