"use client";

import { useState, useRef } from "react";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Star,
  ImagePlus,
  ChevronRight,
} from "lucide-react";

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

  const categoryItems = items.filter((i) => i.category_id === activeCategory);

  return (
    <div className="md:p-6 pb-24">
      {/* Page header */}
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-black-900 text-lg leading-tight">Menu</h1>
          <p className="text-xs text-black-400 mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} &middot; {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <button
          onClick={() => setShowAddItem(true)}
          className="flex items-center gap-1.5 bg-purple-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-purple-400 transition-colors duration-200 cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.5} />
          Add item
        </button>
      </div>

      <div className="flex mt-0 md:mt-4">
        {/* Category sidebar */}
        <div className="w-44 flex-shrink-0 border-r border-black-100 bg-white md:rounded-l-2xl md:border md:border-r-0 overflow-hidden">
          <div className="py-2">
            {categories.map((cat) => {
              const count = items.filter((i) => i.category_id === cat.id).length;
              const isActive = activeCategory === cat.id;
              return (
                <div
                  key={cat.id}
                  className={cn(
                    "group relative flex items-center border-l-2 transition-all duration-200",
                    isActive
                      ? "border-purple-500 bg-purple-50"
                      : "border-transparent hover:bg-black-50"
                  )}
                >
                  <button
                    onClick={() => setActiveCategory(cat.id)}
                    className="flex-1 text-left px-3 py-3 cursor-pointer"
                  >
                    <span
                      className={cn(
                        "block text-sm font-medium leading-tight",
                        isActive ? "text-purple-600" : "text-black-700"
                      )}
                    >
                      {cat.name}
                    </span>
                    <span className="block text-xs text-black-400 mt-0.5">
                      {count} item{count !== 1 ? "s" : ""}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteCategory(cat.id)}
                    className="opacity-0 group-hover:opacity-100 mr-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-black-300 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-all duration-150 cursor-pointer"
                    title="Delete category"
                    aria-label="Delete category"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setShowAddCategory(true)}
              className="w-full flex items-center gap-2 px-3 py-3 text-sm text-black-400 hover:text-purple-500 hover:bg-black-50 transition-colors duration-200 cursor-pointer border-t border-black-50 mt-1"
            >
              <Plus size={14} />
              Add category
            </button>
          </div>
        </div>

        {/* Items panel */}
        <div className="flex-1 bg-white md:rounded-r-2xl md:border md:border-l-0 border-black-100 overflow-hidden min-h-64">
          {/* Panel header */}
          {activeCategory && categories.find((c) => c.id === activeCategory) && (
            <div className="px-4 py-3 border-b border-black-50 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-black-700">
                <ChevronRight size={14} className="text-black-300" />
                {categories.find((c) => c.id === activeCategory)?.name}
                <span className="ml-1 text-xs font-medium text-black-400 bg-black-50 px-1.5 py-0.5 rounded-full">
                  {categoryItems.length}
                </span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {categoryItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mb-3">
                <UtensilsCrossed size={24} className="text-purple-400" />
              </div>
              <p className="text-sm font-medium text-black-700 mb-1">No items yet</p>
              <p className="text-xs text-black-400 mb-4">Add your first item to this category</p>
              <button
                onClick={() => setShowAddItem(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-purple-500 border border-purple-200 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg transition-colors duration-200 cursor-pointer"
              >
                <Plus size={13} />
                Add item
              </button>
            </div>
          )}

          {/* Item rows */}
          <div className="divide-y divide-black-50">
            {categoryItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 transition-colors duration-150",
                  item.is_available ? "hover:bg-black-50/60" : "hover:bg-black-50/40"
                )}
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className={cn(
                        "w-14 h-14 rounded-xl object-cover",
                        !item.is_available && "opacity-50 grayscale"
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "w-14 h-14 rounded-xl bg-black-50 flex items-center justify-center",
                        !item.is_available && "opacity-50"
                      )}
                    >
                      <UtensilsCrossed size={18} className="text-black-200" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p
                      className={cn(
                        "text-sm font-semibold leading-tight",
                        item.is_available ? "text-black-900" : "text-black-300"
                      )}
                    >
                      {item.name}
                    </p>
                    {item.is_featured && (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                        <Star size={9} fill="currentColor" />
                        Featured
                      </span>
                    )}
                    {!item.is_available && (
                      <span className="text-[10px] font-semibold text-black-400 bg-black-100 px-1.5 py-0.5 rounded-full">
                        Unavailable
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-black-400 mt-0.5 truncate">{item.description}</p>
                  )}
                  <p
                    className={cn(
                      "text-xs font-bold mt-1",
                      item.is_available ? "text-purple-600" : "text-black-300"
                    )}
                  >
                    {item.price_kobo === 0
                      ? "From " + formatKobo(
                          item.options
                            ?.find((o) => o.is_required && o.max_selections === 1)
                            ?.choices?.[0]?.price_modifier_kobo ?? 0
                        )
                      : formatKobo(item.price_kobo)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Availability toggle */}
                  <button
                    onClick={() => toggleAvailable(item.id, item.is_available)}
                    title={item.is_available ? "Mark unavailable" : "Mark available"}
                    aria-label={item.is_available ? "Mark unavailable" : "Mark available"}
                    className={cn(
                      "relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 cursor-pointer",
                      item.is_available ? "bg-purple-500" : "bg-black-200"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                        item.is_available ? "translate-x-[18px]" : "translate-x-0"
                      )}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => setEditingItem(item)}
                    title="Edit item"
                    aria-label="Edit item"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-black-400 hover:text-black-700 hover:bg-black-100 transition-colors duration-150 cursor-pointer"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteItem(item.id)}
                    title="Delete item"
                    aria-label="Delete item"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-black-300 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-colors duration-150 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm md:rounded-2xl rounded-t-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black-100">
          <h2 className="font-bold text-black-900">New category</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-black-400 hover:text-black-700 hover:bg-black-100 transition-colors duration-150 cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSave} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black-600 mb-1.5">Category name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
              placeholder="e.g. Starters, Main Course, Drinks"
            />
          </div>
          {error && <p className="text-sm text-cinnabar-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors duration-200 cursor-pointer"
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
  /** null = unlimited */
  maxSelections: number | null;
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

  const existingSizeGroup = item?.price_kobo === 0
    ? item.options?.find((o) => o.is_required && o.max_selections === 1)
    : undefined;

  const [hasSizes, setHasSizes] = useState(!!existingSizeGroup);
  const [sizesLabel, setSizesLabel] = useState(existingSizeGroup?.name ?? "Choose size");
  const [draftSizes, setDraftSizes] = useState<DraftSize[]>(
    existingSizeGroup?.choices.map((c) => ({
      name: c.name,
      priceNgn: c.price_modifier_kobo ? (c.price_modifier_kobo / 100).toString() : "",
    })) ?? [{ name: "", priceNgn: "" }, { name: "", priceNgn: "" }]
  );

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
      { name: "", isRequired: false, maxSelections: null, choices: [{ name: "", priceModifierNgn: "" }] },
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            max_selections: opt.maxSelections as any,
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg md:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black-100">
          <div>
            <h2 className="font-bold text-black-900">
              {item ? "Edit item" : "Add menu item"}
            </h2>
            <p className="text-xs text-black-400 mt-0.5">
              {item ? "Update this item's details" : "Fill in the details below"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-black-400 hover:text-black-700 hover:bg-black-100 transition-colors duration-150 cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-black-600 mb-1.5">Item name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
              placeholder="e.g. Jollof Rice"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-black-600 mb-1.5">Description <span className="text-black-400 font-normal">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors resize-none"
              placeholder="Short description…"
            />
          </div>

          {/* Sizes toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={cn(
              "relative w-10 h-5 rounded-full transition-colors duration-200",
              hasSizes ? "bg-purple-500" : "bg-black-200"
            )}>
              <input
                type="checkbox"
                checked={hasSizes}
                onChange={(e) => setHasSizes(e.target.checked)}
                className="sr-only"
              />
              <span className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                hasSizes ? "translate-x-[18px]" : "translate-x-0"
              )} />
            </div>
            <span className="text-sm text-black-900 font-medium">Multiple sizes / portions</span>
          </label>

          {hasSizes ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-black-600 mb-1.5">Size label</label>
                  <input
                    value={sizesLabel}
                    onChange={(e) => setSizesLabel(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                    placeholder="e.g. Choose size"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black-600 mb-1.5">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors bg-white cursor-pointer"
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-black-500 uppercase tracking-wide">Sizes &amp; prices</label>
                {draftSizes.map((size, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <input
                      value={size.name}
                      onChange={(e) => setDraftSizes((prev) => prev.map((s, i) => i === si ? { ...s, name: e.target.value } : s))}
                      placeholder="e.g. 6 pieces"
                      className="flex-1 px-3 py-2 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                    />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-sm text-black-500 font-medium">₦</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={size.priceNgn}
                        onChange={(e) => setDraftSizes((prev) => prev.map((s, i) => i === si ? { ...s, priceNgn: e.target.value } : s))}
                        placeholder="2000"
                        className="w-24 px-3 py-2 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                      />
                    </div>
                    {draftSizes.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setDraftSizes((prev) => prev.filter((_, i) => i !== si))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-black-300 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-colors duration-150 cursor-pointer flex-shrink-0"
                        aria-label="Remove size"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDraftSizes((prev) => [...prev, { name: "", priceNgn: "" }])}
                  className="flex items-center gap-1 text-xs text-black-400 hover:text-purple-500 font-medium transition-colors duration-150 cursor-pointer"
                >
                  <Plus size={12} /> Add size
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-black-600 mb-1.5">Price (₦)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceNgn}
                  onChange={(e) => setPriceNgn(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                  placeholder="1500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-black-600 mb-1.5">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors bg-white cursor-pointer"
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
            <label className="block text-sm font-medium text-black-600 mb-1.5">
              Photo <span className="text-black-400 font-normal">(max 5MB)</span>
            </label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-black-200 rounded-xl overflow-hidden hover:border-purple-400 transition-colors duration-200 cursor-pointer group"
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Preview" className="w-full h-36 object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-black-400 group-hover:text-purple-500 transition-colors duration-200">
                  <ImagePlus size={24} />
                  <span className="text-sm font-medium">Click to upload photo</span>
                  <span className="text-xs">JPG, PNG or WebP</span>
                </div>
              )}
            </button>
            {imagePreview && (
              <button
                type="button"
                onClick={() => { setImagePreview(""); setImageFile(null); }}
                className="mt-1.5 text-xs text-black-400 hover:text-cinnabar-500 transition-colors duration-150 cursor-pointer"
              >
                Remove photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* Featured */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={cn(
              "relative w-10 h-5 rounded-full transition-colors duration-200",
              isFeatured ? "bg-amber-400" : "bg-black-200"
            )}>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="sr-only"
              />
              <span className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                isFeatured ? "translate-x-[18px]" : "translate-x-0"
              )} />
            </div>
            <div>
              <span className="text-sm font-medium text-black-900">Featured item</span>
              <p className="text-xs text-black-400">Highlighted on your public menu</p>
            </div>
          </label>

          {/* Options & Add-ons */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-black-700">Options &amp; Add-ons</p>
                <p className="text-xs text-black-400">e.g. Choose Protein, Add Extras</p>
              </div>
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1 text-xs text-purple-500 font-semibold hover:text-purple-400 transition-colors duration-150 cursor-pointer bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg"
              >
                <Plus size={12} /> Add group
              </button>
            </div>

            {draftOptions.map((opt, oi) => (
              <div key={oi} className="border border-black-200 rounded-xl p-4 space-y-3 bg-black-50/30">
                {/* Group header */}
                <div className="flex items-center gap-2">
                  <input
                    value={opt.name}
                    onChange={(e) => updateOption(oi, { name: e.target.value })}
                    placeholder="Group name (e.g. Choose Protein)"
                    className="flex-1 px-3 py-2 rounded-lg border border-black-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(oi)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-black-300 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-colors duration-150 cursor-pointer flex-shrink-0"
                    aria-label="Remove option group"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Group settings */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opt.isRequired}
                      onChange={(e) => updateOption(oi, { isRequired: e.target.checked })}
                      className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-black-600 font-medium">Required</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={opt.maxSelections !== null}
                      onChange={(e) =>
                        updateOption(oi, { maxSelections: e.target.checked ? 1 : null })
                      }
                      className="w-3.5 h-3.5 accent-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-black-600 font-medium">Limit to</span>
                  </label>
                  {opt.maxSelections !== null && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={opt.maxSelections}
                        onChange={(e) =>
                          updateOption(oi, { maxSelections: parseInt(e.target.value) || 1 })
                        }
                        className="w-12 px-2 py-1 rounded-lg border border-black-200 text-xs text-center focus:outline-none focus:border-purple-500 bg-white"
                      />
                      <span className="text-xs text-black-400">max</span>
                    </div>
                  )}
                </div>

                {/* Choices */}
                <div className="space-y-2">
                  {opt.choices.map((choice, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <input
                        value={choice.name}
                        onChange={(e) => updateChoice(oi, ci, { name: e.target.value })}
                        placeholder="Choice name (e.g. Chicken)"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-black-200 text-sm focus:outline-none focus:border-purple-500 bg-white transition-colors"
                      />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-black-400 font-medium">+₦</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={choice.priceModifierNgn}
                          onChange={(e) => updateChoice(oi, ci, { priceModifierNgn: e.target.value })}
                          placeholder="0"
                          className="w-16 px-2 py-1.5 rounded-lg border border-black-200 text-sm text-right focus:outline-none focus:border-purple-500 bg-white transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeChoice(oi, ci)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-black-300 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-colors duration-150 cursor-pointer flex-shrink-0"
                        aria-label="Remove choice"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addChoice(oi)}
                    className="flex items-center gap-1 text-xs text-black-400 hover:text-purple-500 font-medium transition-colors duration-150 cursor-pointer"
                  >
                    <Plus size={11} /> Add choice
                  </button>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-cinnabar-50 border border-cinnabar-200 text-cinnabar-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-black-100 bg-white md:rounded-b-2xl">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors duration-200 cursor-pointer"
          >
            {saving ? "Saving…" : item ? "Save changes" : "Add item"}
          </button>
        </div>
      </div>
    </div>
  );
}
