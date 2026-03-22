"use client";

import { useState, useRef } from "react";

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
  const [showAddCategory, setShowAddCategory] = useState(false);
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

  async function deleteCategory(catId: string) {
    const hasItems = items.some((i) => i.category_id === catId);
    if (hasItems) {
      alert("Move or delete all items in this category first.");
      return;
    }
    if (!confirm("Delete this category?")) return;
    await supabase.from("menu_categories").delete().eq("id", catId);
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (activeCategory === catId) {
      setActiveCategory(categories.find((c) => c.id !== catId)?.id ?? null);
    }
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
            <div
              key={cat.id}
              className={cn(
                "group flex items-center border-b border-black-50 transition-colors",
                activeCategory === cat.id
                  ? "bg-viridian-500/10"
                  : "hover:bg-black-50"
              )}
            >
              <button
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex-1 text-left px-3 py-3 text-sm transition-colors",
                  activeCategory === cat.id
                    ? "text-viridian-500 font-semibold"
                    : "text-black-500"
                )}
              >
                {cat.name}
              </button>
              <button
                onClick={() => deleteCategory(cat.id)}
                className="opacity-0 group-hover:opacity-100 pr-2 text-black-300 hover:text-cinnabar-500 transition-opacity text-xs"
                title="Delete category"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowAddCategory(true)}
            className="w-full text-left px-3 py-3 text-sm text-black-400 hover:bg-black-50 hover:text-viridian-500 transition-colors border-b border-black-50"
          >
            + Add category
          </button>
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

      {/* Add category modal */}
      {showAddCategory && (
        <AddCategoryModal
          restaurantId={restaurantId}
          nextOrder={categories.length}
          onClose={() => setShowAddCategory(false)}
          onSave={(newCat) => {
            setCategories((prev) => [...prev, newCat]);
            setActiveCategory(newCat.id);
            setShowAddCategory(false);
          }}
        />
      )}
    </div>
  );
}

function AddCategoryModal({
  restaurantId,
  nextOrder,
  onClose,
  onSave,
}: {
  restaurantId: string;
  nextOrder: number;
  onClose: () => void;
  onSave: (category: MenuCategory) => void;
}) {
  const supabase = createBrowserClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    const { data, error: insertError } = await supabase
      .from("menu_categories")
      .insert({ restaurant_id: restaurantId, name: name.trim(), display_order: nextOrder })
      .select("*")
      .single();
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    onSave(data as MenuCategory);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black-900/50">
      <div className="bg-white w-full max-w-sm md:rounded-2xl rounded-t-2xl">
        <div className="flex items-center justify-between px-4 py-4 border-b border-black-100">
          <h2 className="font-bold text-black-900">New category</h2>
          <button onClick={onClose} className="text-black-400 hover:text-black-900">✕</button>
        </div>
        <form onSubmit={handleSave} className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Category name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
              placeholder="e.g. Starters, Main Course, Drinks"
            />
          </div>
          {error && <p className="text-sm text-cinnabar-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-viridian-500 hover:bg-viridian-500/90 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {saving ? "Creating…" : "Create category"}
          </button>
        </form>
      </div>
    </div>
  );
}

interface DraftChoice {
  name: string;
  priceModifierNgn: string;
}

interface DraftOption {
  name: string;
  isRequired: boolean;
  maxSelections: number;
  choices: DraftChoice[];
}

interface DraftSize {
  name: string;
  priceNgn: string;
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
  const [categoryId, setCategoryId] = useState(
    item?.category_id ?? defaultCategoryId ?? ""
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(item?.image_url ?? "");
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Detect existing size group: a required, single-select option on an item with price_kobo=0
  const existingSizeGroup = item?.price_kobo === 0
    ? item.options.find((o) => o.is_required && o.max_selections === 1)
    : undefined;

  const [hasSizes, setHasSizes] = useState(!!existingSizeGroup);
  const [sizesLabel, setSizesLabel] = useState(existingSizeGroup?.name ?? "Choose size");
  const [draftSizes, setDraftSizes] = useState<DraftSize[]>(
    existingSizeGroup?.choices.map((c) => ({
      name: c.name,
      priceNgn: c.price_modifier_kobo ? (c.price_modifier_kobo / 100).toString() : "",
    })) ?? [{ name: "", priceNgn: "" }, { name: "", priceNgn: "" }]
  );

  // Base price — only used when hasSizes is false
  const [priceNgn, setPriceNgn] = useState(
    item && item.price_kobo > 0 ? (item.price_kobo / 100).toString() : ""
  );

  const [draftOptions, setDraftOptions] = useState<DraftOption[]>(
    (item?.options ?? [])
      .filter((o) => o.id !== existingSizeGroup?.id)
      .map((o) => ({
        name: o.name,
        isRequired: o.is_required,
        maxSelections: o.max_selections,
        choices: o.choices.map((c) => ({
          name: c.name,
          priceModifierNgn: c.price_modifier_kobo ? (c.price_modifier_kobo / 100).toString() : "",
        })),
      }))
  );

  function addOption() {
    setDraftOptions((prev) => [
      ...prev,
      { name: "", isRequired: false, maxSelections: 1, choices: [{ name: "", priceModifierNgn: "" }] },
    ]);
  }

  function removeOption(oi: number) {
    setDraftOptions((prev) => prev.filter((_, i) => i !== oi));
  }

  function updateOption(oi: number, patch: Partial<DraftOption>) {
    setDraftOptions((prev) => prev.map((o, i) => (i === oi ? { ...o, ...patch } : o)));
  }

  function addChoice(oi: number) {
    setDraftOptions((prev) =>
      prev.map((o, i) =>
        i === oi ? { ...o, choices: [...o.choices, { name: "", priceModifierNgn: "" }] } : o
      )
    );
  }

  function removeChoice(oi: number, ci: number) {
    setDraftOptions((prev) =>
      prev.map((o, i) =>
        i === oi ? { ...o, choices: o.choices.filter((_, j) => j !== ci) } : o
      )
    );
  }

  function updateChoice(oi: number, ci: number, patch: Partial<DraftChoice>) {
    setDraftOptions((prev) =>
      prev.map((o, i) =>
        i === oi
          ? { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
          : o
      )
    );
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MENU_IMAGE_MAX_SIZE_BYTES) {
      setError(`Image must be under ${MENU_IMAGE_MAX_SIZE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (hasSizes) {
      const validSizes = draftSizes.filter((s) => s.name.trim() && s.priceNgn);
      if (validSizes.length < 2) { setError("Add at least 2 sizes"); return; }
    } else {
      if (!priceNgn || isNaN(parseFloat(priceNgn))) { setError("Valid price required"); return; }
    }
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
        const { data: { publicUrl } } = supabase.storage.from("menu-images").getPublicUrl(path);
        imageUrl = publicUrl;
      }

      const priceKobo = hasSizes ? 0 : Math.round(parseFloat(priceNgn) * 100);
      const payload = {
        restaurant_id: restaurantId,
        name: name.trim(),
        description: description.trim() || null,
        price_kobo: priceKobo,
        category_id: categoryId || null,
        image_url: imageUrl,
        is_featured: isFeatured,
      };

      let itemId: string;

      if (item) {
        const { data, error: updateError } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", item.id)
          .select("id")
          .single();
        if (updateError) throw updateError;
        itemId = data.id;
        // Delete all existing options (cascade removes choices)
        await supabase.from("menu_item_options").delete().eq("menu_item_id", itemId);
      } else {
        const { data, error: insertError } = await supabase
          .from("menu_items")
          .insert({ ...payload, display_order: 0, price: priceKobo })
          .select("id")
          .single();
        if (insertError) throw insertError;
        itemId = data.id;
      }

      // Save size group first (if enabled)
      if (hasSizes) {
        const validSizes = draftSizes.filter((s) => s.name.trim() && s.priceNgn);
        const { data: sizeOptRow, error: sizeOptError } = await supabase
          .from("menu_item_options")
          .insert({
            restaurant_id: restaurantId,
            menu_item_id: itemId,
            name: sizesLabel.trim() || "Choose size",
            is_required: true,
            min_selections: 1,
            max_selections: 1,
          })
          .select("id")
          .single();
        if (sizeOptError) throw sizeOptError;
        const { error: sizeChoiceError } = await supabase
          .from("menu_item_option_choices")
          .insert(
            validSizes.map((s) => ({
              restaurant_id: restaurantId,
              option_id: sizeOptRow.id,
              name: s.name.trim(),
              price_modifier_kobo: Math.round(parseFloat(s.priceNgn) * 100),
              is_available: true,
            }))
          );
        if (sizeChoiceError) throw sizeChoiceError;
      }

      // Save add-on option groups + choices
      for (const opt of draftOptions) {
        if (!opt.name.trim()) continue;
        const { data: optRow, error: optError } = await supabase
          .from("menu_item_options")
          .insert({
            restaurant_id: restaurantId,
            menu_item_id: itemId,
            name: opt.name.trim(),
            is_required: opt.isRequired,
            min_selections: opt.isRequired ? 1 : 0,
            max_selections: opt.maxSelections,
          })
          .select("id")
          .single();
        if (optError) throw optError;

        const validChoices = opt.choices.filter((c) => c.name.trim());
        if (validChoices.length > 0) {
          const { error: choiceError } = await supabase.from("menu_item_option_choices").insert(
            validChoices.map((c) => ({
              restaurant_id: restaurantId,
              option_id: optRow.id,
              name: c.name.trim(),
              price_modifier_kobo: Math.round(parseFloat(c.priceModifierNgn || "0") * 100),
              is_available: true,
            }))
          );
          if (choiceError) throw choiceError;
        }
      }

      // Refetch full item with options
      const { data: fullItem, error: fetchError } = await supabase
        .from("menu_items")
        .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
        .eq("id", itemId)
        .single();
      if (fetchError) throw fetchError;

      onSave(fullItem as unknown as MenuItemWithOptions);
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

          {/* Sizes toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasSizes}
              onChange={(e) => setHasSizes(e.target.checked)}
              className="w-4 h-4 accent-viridian-500"
            />
            <span className="text-sm text-black-900 font-medium">This item has multiple sizes / portions</span>
          </label>

          {hasSizes ? (
            /* Sizes section */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-black-500 mb-1">Size label</label>
                  <input
                    value={sizesLabel}
                    onChange={(e) => setSizesLabel(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
                    placeholder="e.g. Choose size"
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

              <div className="space-y-2">
                {draftSizes.map((size, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <input
                      value={size.name}
                      onChange={(e) => setDraftSizes((prev) => prev.map((s, i) => i === si ? { ...s, name: e.target.value } : s))}
                      placeholder="e.g. 6 pieces"
                      className="flex-1 px-3 py-2 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-black-400">₦</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={size.priceNgn}
                        onChange={(e) => setDraftSizes((prev) => prev.map((s, i) => i === si ? { ...s, priceNgn: e.target.value } : s))}
                        placeholder="2000"
                        className="w-24 px-3 py-2 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
                      />
                    </div>
                    {draftSizes.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setDraftSizes((prev) => prev.filter((_, i) => i !== si))}
                        className="text-black-300 hover:text-cinnabar-500 text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDraftSizes((prev) => [...prev, { name: "", priceNgn: "" }])}
                  className="text-xs text-black-400 hover:text-viridian-500 font-medium"
                >
                  + Add size
                </button>
              </div>
            </div>
          ) : (
            /* Normal price + category */
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
          )}

          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-black-500 mb-1">Image (max 5MB)</label>
            <div
              className="border-2 border-dashed border-black-200 rounded-xl p-4 text-center cursor-pointer hover:border-viridian-500 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
              ) : (
                <p className="text-sm text-black-400">Click to upload image</p>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
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

          {/* Options & Add-ons */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-black-700">Options & Add-ons</p>
              <button
                type="button"
                onClick={addOption}
                className="text-xs text-viridian-500 font-semibold hover:text-viridian-600"
              >
                + Add option group
              </button>
            </div>

            {draftOptions.length === 0 && (
              <p className="text-xs text-black-400">
                Add option groups so customers can customise their order (e.g. &ldquo;Choose Protein&rdquo;, &ldquo;Add Extras&rdquo;).
              </p>
            )}

            {draftOptions.map((opt, oi) => (
              <div key={oi} className="border border-black-200 rounded-xl p-3 space-y-2.5">
                {/* Group header */}
                <div className="flex items-center gap-2">
                  <input
                    value={opt.name}
                    onChange={(e) => updateOption(oi, { name: e.target.value })}
                    placeholder="Group name (e.g. Choose Protein)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(oi)}
                    className="text-black-300 hover:text-cinnabar-500 text-sm flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {/* Group settings */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opt.isRequired}
                      onChange={(e) => updateOption(oi, { isRequired: e.target.checked })}
                      className="w-3.5 h-3.5 accent-viridian-500"
                    />
                    <span className="text-xs text-black-500">Required</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-black-400">Max selections:</span>
                    <input
                      type="number"
                      min="1"
                      value={opt.maxSelections}
                      onChange={(e) => updateOption(oi, { maxSelections: parseInt(e.target.value) || 1 })}
                      className="w-12 px-2 py-1 rounded-lg border border-black-200 text-xs text-center focus:outline-none focus:border-viridian-500"
                    />
                  </div>
                </div>

                {/* Choices */}
                <div className="space-y-1.5">
                  {opt.choices.map((choice, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <input
                        value={choice.name}
                        onChange={(e) => updateChoice(oi, ci, { name: e.target.value })}
                        placeholder="Choice name (e.g. Chicken)"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black-200 text-sm focus:outline-none focus:border-viridian-500"
                      />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-black-400">+₦</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={choice.priceModifierNgn}
                          onChange={(e) => updateChoice(oi, ci, { priceModifierNgn: e.target.value })}
                          placeholder="0"
                          className="w-16 px-2 py-1.5 rounded-lg border border-black-200 text-sm text-right focus:outline-none focus:border-viridian-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeChoice(oi, ci)}
                        className="text-black-300 hover:text-cinnabar-500 text-sm flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addChoice(oi)}
                    className="text-xs text-black-400 hover:text-viridian-500 font-medium"
                  >
                    + Add choice
                  </button>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-cinnabar-500">{error}</p>}
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
