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
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
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
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategories[0]?.id ?? null
  );

  function handleExport() {
    const catMap = new Map(categories.map((c) => [c.id, c.name]));
    const header = "name,description,price,category,is_featured,prep_time_minutes,image_url";
    const csvRows = items.map((item) => {
      const cell = (v: string) =>
        v.includes(",") || v.includes('"') || v.includes("\n")
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      return [
        cell(item.name),
        cell(item.description ?? ""),
        item.price_kobo > 0 ? (item.price_kobo / 100).toString() : "0",
        cell(item.category_id ? (catMap.get(item.category_id) ?? "") : ""),
        item.is_featured ? "true" : "false",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item as any).prep_time_minutes ?? "",
        item.image_url ?? "",
      ].join(",");
    });
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 bg-black-100 text-black-600 text-sm font-semibold px-3.5 py-2.5 rounded-xl hover:bg-black-200 transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export menu as CSV"
          >
            <Download size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => setShowCsvImport(true)}
            className="flex items-center gap-1.5 bg-black-100 text-black-600 text-sm font-semibold px-3.5 py-2.5 rounded-xl hover:bg-black-200 transition-colors duration-200 cursor-pointer"
          >
            <Upload size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline">Import CSV</span>
          </button>
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-1.5 bg-purple-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-purple-400 transition-colors duration-200 cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} />
            Add item
          </button>
        </div>
      </div>

      {/* ── MOBILE: horizontal category pills ── */}
      <div className="md:hidden bg-white border-b border-black-100">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 py-3">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap",
                  isActive
                    ? "bg-purple-500 text-white"
                    : "bg-black-100 text-black-500 hover:bg-black-200"
                )}
              >
                {cat.name}
              </button>
            );
          })}
          <button
            onClick={() => setShowAddCategory(true)}
            className="flex-shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-semibold text-black-400 border border-dashed border-black-200 hover:border-purple-300 hover:text-purple-500 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus size={12} />
            Category
          </button>
        </div>
      </div>

      {/* ── MOBILE: full-width items list ── */}
      <div className="md:hidden bg-white mt-0">
        <ItemsPanel
          categoryItems={categoryItems}
          categories={categories}
          activeCategory={activeCategory}
          onToggle={toggleAvailable}
          onEdit={setEditingItem}
          onDelete={deleteItem}
          onAddItem={() => setShowAddItem(true)}
          showCategoryHeader={false}
        />
      </div>

      {/* ── DESKTOP: two-column sidebar layout ── */}
      <div className="hidden md:flex mt-4">
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

        {/* Desktop items panel */}
        <div className="flex-1 bg-white md:rounded-r-2xl md:border md:border-l-0 border-black-100 overflow-hidden min-h-64">
          <ItemsPanel
            categoryItems={categoryItems}
            categories={categories}
            activeCategory={activeCategory}
            onToggle={toggleAvailable}
            onEdit={setEditingItem}
            onDelete={deleteItem}
            onAddItem={() => setShowAddItem(true)}
            showCategoryHeader
          />
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

      {/* CSV import modal */}
      {showCsvImport && (
        <CsvImportModal
          restaurantId={restaurantId}
          categories={categories}
          existingItemCount={items.length}
          onClose={() => setShowCsvImport(false)}
          onImported={(newCats, newItems, replaced) => {
            setCategories((prev) => {
              const existingIds = new Set(prev.map((c) => c.id));
              return [...prev, ...newCats.filter((c) => !existingIds.has(c.id))];
            });
            if (replaced) {
              // Replace: swap out the item list entirely with only the visible imported items
              setItems(newItems);
              setActiveCategory(newItems[0]?.category_id ?? newCats[0]?.id ?? null);
            } else {
              setItems((prev) => [...prev, ...newItems]);
            }
            setShowCsvImport(false);
          }}
        />
      )}
    </div>
  );
}

interface ItemsPanelProps {
  categoryItems: MenuItemWithOptions[];
  categories: MenuCategory[];
  activeCategory: string | null;
  onToggle: (itemId: string, current: boolean) => void;
  onEdit: (item: MenuItemWithOptions) => void;
  onDelete: (itemId: string) => void;
  onAddItem: () => void;
  showCategoryHeader: boolean;
}

function ItemsPanel({
  categoryItems,
  categories,
  activeCategory,
  onToggle,
  onEdit,
  onDelete,
  onAddItem,
  showCategoryHeader,
}: ItemsPanelProps) {
  const activeCategoryName = categories.find((c) => c.id === activeCategory)?.name ?? "Items";

  return (
    <>
      {showCategoryHeader && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black-100">
          <div>
            <p className="text-xs text-black-400 font-medium uppercase tracking-wide">Category</p>
            <p className="font-bold text-black-900 text-sm mt-0.5">{activeCategoryName}</p>
          </div>
          <button
            onClick={onAddItem}
            className="flex items-center gap-1.5 text-xs font-semibold text-purple-500 hover:text-purple-400 bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add item
          </button>
        </div>
      )}

      {categoryItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
          <div className="w-12 h-12 rounded-full bg-black-100 flex items-center justify-center">
            <UtensilsCrossed size={22} className="text-black-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-black-600">No items yet</p>
            <p className="text-xs text-black-400 mt-0.5">Add your first item to this category</p>
          </div>
          <button
            onClick={onAddItem}
            className="flex items-center gap-1.5 bg-purple-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-purple-400 transition-colors duration-200 cursor-pointer"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add item
          </button>
        </div>
      ) : (
        <div className="divide-y divide-black-50">
          {categoryItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-black-50/50 transition-colors duration-150"
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
                  <UtensilsCrossed size={18} className="text-black-300" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className={cn(
                    "text-sm font-semibold leading-tight truncate",
                    item.is_available ? "text-black-900" : "text-black-400"
                  )}>
                    {item.name}
                  </p>
                  {item.is_featured && (
                    <Star size={11} className="text-amber-400 fill-amber-400 flex-shrink-0" />
                  )}
                  {!item.is_available && (
                    <span className="flex-shrink-0 text-[10px] font-semibold text-black-400 bg-black-100 px-1.5 py-0.5 rounded-full">
                      Off
                    </span>
                  )}
                </div>
                <p className="text-xs text-black-500 mt-0.5 font-medium">
                  {item.price_kobo === 0
                    ? "Multiple sizes"
                    : formatKobo(item.price_kobo)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Availability toggle */}
                <button
                  onClick={() => onToggle(item.id, item.is_available)}
                  className={cn(
                    "relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0",
                    item.is_available ? "bg-purple-500" : "bg-black-200"
                  )}
                  title={item.is_available ? "Mark unavailable" : "Mark available"}
                  aria-label="Toggle availability"
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                    item.is_available ? "translate-x-[16px]" : "translate-x-0"
                  )} />
                </button>

                {/* Edit */}
                <button
                  onClick={() => onEdit(item)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-black-400 hover:text-purple-500 hover:bg-purple-50 transition-colors duration-150 cursor-pointer"
                  title="Edit item"
                  aria-label="Edit item"
                >
                  <Pencil size={13} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => onDelete(item.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-black-300 hover:text-cinnabar-500 hover:bg-cinnabar-50 transition-colors duration-150 cursor-pointer"
                  title="Delete item"
                  aria-label="Delete item"
                >
                  <Trash2 size={13} />
                </button>

                <ChevronRight size={14} className="text-black-200 hidden md:block" />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
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
  // Opt-in: off by default, the merchant turns it on per item.
  const [showNewBadge, setShowNewBadge] = useState(
    (item as { show_new_badge?: boolean } | null)?.show_new_badge ?? false
  );
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
        show_new_badge: showNewBadge,
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

          {/* NEW badge */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={cn(
              "relative w-10 h-5 rounded-full transition-colors duration-200",
              showNewBadge ? "bg-purple-500" : "bg-black-200"
            )}>
              <input
                type="checkbox"
                checked={showNewBadge}
                onChange={(e) => setShowNewBadge(e.target.checked)}
                className="sr-only"
              />
              <span className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200",
                showNewBadge ? "translate-x-[18px]" : "translate-x-0"
              )} />
            </div>
            <div>
              <span className="text-sm font-medium text-black-900">Show “NEW” badge</span>
              <p className="text-xs text-black-400">Display a NEW tag on this item in your storefront</p>
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

// ─── CSV helpers ─────────────────────────────────────────────────────────────

interface CsvRow {
  name: string;
  description: string;
  price: string;
  category: string;
  is_featured: string;
  prep_time_minutes: string;
  image_url: string;
}

interface ParsedRow extends CsvRow {
  _line: number;
  _errors: string[];
  _priceKobo: number;
}

const CSV_TEMPLATE =
  "name,description,price,category,is_featured,prep_time_minutes\n" +
  "Jollof Rice,Smoky party jollof with fried plantain,2500,Main Course,false,20\n" +
  "Chicken Suya,Spiced grilled chicken skewers,1800,Starters,false,15\n" +
  "Chapman,Classic Nigerian cocktail mocktail,1200,Drinks,false,5\n";

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const requiredHeaders = ["name", "price"];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return [{
      name: "", description: "", price: "", category: "",
      is_featured: "", prep_time_minutes: "", image_url: "",
      _line: 1,
      _errors: [`Missing required column(s): ${missingHeaders.join(", ")}`],
      _priceKobo: 0,
    }];
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (values[idx] ?? "").trim(); });

    const row: ParsedRow = {
      name: obj["name"] ?? "",
      description: obj["description"] ?? "",
      price: obj["price"] ?? "",
      category: obj["category"] ?? "",
      is_featured: obj["is_featured"] ?? "false",
      prep_time_minutes: obj["prep_time_minutes"] ?? "",
      image_url: obj["image_url"] ?? "",
      _line: i + 1,
      _errors: [],
      _priceKobo: 0,
    };

    if (!row.name.trim()) row._errors.push("Name is required");
    const priceNum = parseFloat(row.price);
    if (!row.price || isNaN(priceNum) || priceNum < 0) {
      row._errors.push("Price must be a positive number");
    } else {
      row._priceKobo = Math.round(priceNum * 100);
    }

    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "foodo-menu-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CsvImportModal ───────────────────────────────────────────────────────────

interface CsvImportModalProps {
  restaurantId: string;
  categories: MenuCategory[];
  existingItemCount: number;
  onClose: () => void;
  onImported: (newCategories: MenuCategory[], newItems: MenuItemWithOptions[], replaced: boolean) => void;
}

function CsvImportModal({ restaurantId, categories, existingItemCount, onClose, onImported }: CsvImportModalProps) {
  const supabase = createBrowserClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importMode, setImportMode] = useState<"add" | "replace">("add");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importDone, setImportDone] = useState(false);

  const validRows = rows.filter((r) => r._errors.length === 0);
  const errorRows = rows.filter((r) => r._errors.length > 0);
  const hasHeaderError = rows.length === 1 && rows[0]._line === 1 && rows[0]._errors.length > 0;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportDone(false);
    setImportError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseCSV(text));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setImportError("");

    try {
      // ── Resolve / create categories (shared by both modes) ─────────────────
      const categoryMap = new Map<string, string>(categories.map((c) => [c.name.toLowerCase(), c.id]));
      const newCategories: MenuCategory[] = [];

      const uniqueCatNames = [...new Set(validRows.map((r) => r.category.trim()).filter(Boolean))];
      for (const catName of uniqueCatNames) {
        if (!categoryMap.has(catName.toLowerCase())) {
          const { data, error } = await supabase
            .from("menu_categories")
            .insert({ restaurant_id: restaurantId, name: catName, display_order: categories.length + newCategories.length })
            .select("*")
            .single();
          if (error) throw error;
          categoryMap.set(catName.toLowerCase(), data.id);
          newCategories.push(data as MenuCategory);
        }
      }

      if (importMode === "replace") {
        // ── Replace: hide-then-upsert so order history is never broken ─────────
        // Deleting menu_items that are referenced by order_items would violate the
        // FK constraint. Instead we hide everything, then update matched rows back
        // to visible and insert genuinely new items.

        const { data: existingItems, error: fetchErr } = await supabase
          .from("menu_items")
          .select("id, name")
          .eq("restaurant_id", restaurantId);
        if (fetchErr) throw fetchErr;

        const { error: hideErr } = await supabase
          .from("menu_items")
          .update({ is_available: false })
          .eq("restaurant_id", restaurantId);
        if (hideErr) throw hideErr;

        const existingByName = new Map(
          (existingItems ?? []).map((i) => [i.name.toLowerCase(), i.id])
        );

        const toUpdate: { id: string; row: ParsedRow }[] = [];
        const toInsert: ParsedRow[] = [];
        for (const row of validRows) {
          const existingId = existingByName.get(row.name.trim().toLowerCase());
          if (existingId) toUpdate.push({ id: existingId, row });
          else toInsert.push(row);
        }

        await Promise.all(
          toUpdate.map(({ id, row }) =>
            supabase
              .from("menu_items")
              .update({
                name: row.name.trim(),
                description: row.description.trim() || null,
                price_kobo: row._priceKobo,
                price: row._priceKobo,
                category_id: row.category.trim() ? (categoryMap.get(row.category.trim().toLowerCase()) ?? null) : null,
                is_featured: row.is_featured.toLowerCase() === "true",
                prep_time_minutes: row.prep_time_minutes ? parseInt(row.prep_time_minutes, 10) || null : null,
                image_url: row.image_url.trim() || null,
                is_available: true,
              })
              .eq("id", id)
          )
        );

        let insertedItems: MenuItemWithOptions[] = [];
        if (toInsert.length > 0) {
          const { data: inserted, error: insertError } = await supabase
            .from("menu_items")
            .insert(
              toInsert.map((row) => ({
                restaurant_id: restaurantId,
                name: row.name.trim(),
                description: row.description.trim() || null,
                price_kobo: row._priceKobo,
                price: row._priceKobo,
                category_id: row.category.trim() ? (categoryMap.get(row.category.trim().toLowerCase()) ?? null) : null,
                is_featured: row.is_featured.toLowerCase() === "true",
                prep_time_minutes: row.prep_time_minutes ? parseInt(row.prep_time_minutes, 10) || null : null,
                image_url: row.image_url.trim() || null,
                is_available: true,
                display_order: 0,
              }))
            )
            .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))");
          if (insertError) throw insertError;
          insertedItems = inserted as unknown as MenuItemWithOptions[];
        }

        let updatedItems: MenuItemWithOptions[] = [];
        if (toUpdate.length > 0) {
          const { data: fetched, error: fetchUpdErr } = await supabase
            .from("menu_items")
            .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
            .in("id", toUpdate.map((u) => u.id));
          if (fetchUpdErr) throw fetchUpdErr;
          updatedItems = fetched as unknown as MenuItemWithOptions[];
        }

        setImportDone(true);
        onImported(newCategories, [...updatedItems, ...insertedItems], true);

      } else {
        // ── Add mode: bulk insert ──────────────────────────────────────────────
        const { data: inserted, error: insertError } = await supabase
          .from("menu_items")
          .insert(
            validRows.map((row) => ({
              restaurant_id: restaurantId,
              name: row.name.trim(),
              description: row.description.trim() || null,
              price_kobo: row._priceKobo,
              price: row._priceKobo,
              category_id: row.category.trim() ? (categoryMap.get(row.category.trim().toLowerCase()) ?? null) : null,
              is_featured: row.is_featured.toLowerCase() === "true",
              prep_time_minutes: row.prep_time_minutes ? parseInt(row.prep_time_minutes, 10) || null : null,
              image_url: row.image_url.trim() || null,
              is_available: true,
              display_order: 0,
            }))
          )
          .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))");
        if (insertError) throw insertError;

        setImportDone(true);
        onImported(newCategories, inserted as unknown as MenuItemWithOptions[], false);
      }
    } catch (e: unknown) {
      setImportError((e as Error).message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black-100">
          <div>
            <h2 className="font-bold text-black-900">Import menu from CSV</h2>
            <p className="text-xs text-black-400 mt-0.5">
              Upload a CSV to bulk-add items. Images are added manually afterward.
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Template download */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-700">Step 1 — Get the template</p>
              <p className="text-xs text-purple-500 mt-0.5">
                Download the CSV template and feed it to an AI with your menu. The AI fills in the rows.
              </p>
              <p className="text-xs text-black-400 mt-1 font-mono">
                name, description, price, category, is_featured, prep_time_minutes
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex-shrink-0 flex items-center gap-1.5 bg-purple-500 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-purple-400 transition-colors cursor-pointer"
            >
              <Download size={13} />
              Template
            </button>
          </div>

          {/* File upload */}
          <div>
            <p className="text-sm font-semibold text-black-700 mb-2">Step 2 — Upload your CSV</p>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-black-200 hover:border-purple-400 rounded-xl px-5 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors duration-150 group"
            >
              <Upload size={22} className="text-black-300 group-hover:text-purple-400 transition-colors" />
              {fileName ? (
                <p className="text-sm font-medium text-black-700">{fileName}</p>
              ) : (
                <p className="text-sm text-black-400">Click to select a <span className="font-semibold">.csv</span> file</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Preview table */}
          {rows.length > 0 && !hasHeaderError && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-black-700">Preview</p>
                <span className="text-xs bg-green-50 text-green-600 font-semibold px-2 py-0.5 rounded-full">
                  {validRows.length} valid
                </span>
                {errorRows.length > 0 && (
                  <span className="text-xs bg-cinnabar-50 text-cinnabar-600 font-semibold px-2 py-0.5 rounded-full">
                    {errorRows.length} errors
                  </span>
                )}
              </div>
              <div className="border border-black-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-black-50 border-b border-black-100">
                      <tr>
                        <th className="text-left px-3 py-2 text-black-500 font-semibold">Name</th>
                        <th className="text-left px-3 py-2 text-black-500 font-semibold">Category</th>
                        <th className="text-right px-3 py-2 text-black-500 font-semibold">Price (₦)</th>
                        <th className="text-left px-3 py-2 text-black-500 font-semibold hidden sm:table-cell">Description</th>
                        <th className="px-3 py-2 text-black-500 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black-50">
                      {rows.map((row) => (
                        <tr key={row._line} className={row._errors.length > 0 ? "bg-cinnabar-50/40" : ""}>
                          <td className="px-3 py-2 text-black-800 font-medium max-w-[120px] truncate">
                            {row.name || <span className="text-cinnabar-400 italic">empty</span>}
                          </td>
                          <td className="px-3 py-2 text-black-500 max-w-[100px] truncate">{row.category || "—"}</td>
                          <td className="px-3 py-2 text-black-800 text-right font-mono">
                            {row._priceKobo > 0 ? `₦${(row._priceKobo / 100).toLocaleString()}` : <span className="text-cinnabar-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-black-400 max-w-[180px] truncate hidden sm:table-cell">
                            {row.description || "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row._errors.length === 0 ? (
                              <CheckCircle2 size={14} className="text-green-500 mx-auto" />
                            ) : (
                              <span title={row._errors.join("; ")}>
                                <AlertCircle size={14} className="text-cinnabar-500 mx-auto" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {errorRows.length > 0 && (
                <div className="mt-2 space-y-1">
                  {errorRows.map((row) => (
                    <p key={row._line} className="text-xs text-cinnabar-500">
                      Row {row._line}: {row._errors.join(", ")}
                    </p>
                  ))}
                  <p className="text-xs text-black-400">Only valid rows will be imported.</p>
                </div>
              )}
            </div>
          )}

          {hasHeaderError && (
            <div className="bg-cinnabar-50 border border-cinnabar-200 rounded-xl px-4 py-3 text-sm text-cinnabar-600">
              {rows[0]._errors[0]}
            </div>
          )}

          {/* Import mode selector — shown once a valid file is loaded */}
          {validRows.length > 0 && !importDone && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-black-700">How should we import this?</p>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-black-200 cursor-pointer hover:border-purple-400 transition-colors has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                <input
                  type="radio"
                  name="importMode"
                  value="add"
                  checked={importMode === "add"}
                  onChange={() => setImportMode("add")}
                  className="mt-0.5 accent-purple-500 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-semibold text-black-900">Add to existing menu</p>
                  <p className="text-xs text-black-400 mt-0.5">
                    The {validRows.length} item{validRows.length !== 1 ? "s" : ""} in this file will be added alongside your current menu.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-black-200 cursor-pointer hover:border-cinnabar-400 transition-colors has-[:checked]:border-cinnabar-500 has-[:checked]:bg-cinnabar-50">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === "replace"}
                  onChange={() => setImportMode("replace")}
                  className="mt-0.5 accent-red-500 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-semibold text-black-900">Replace entire menu</p>
                  <p className="text-xs text-black-400 mt-0.5">
                    Your current {existingItemCount} item{existingItemCount !== 1 ? "s" : ""} and {categories.length} categor{categories.length !== 1 ? "ies" : "y"} will be <span className="font-semibold text-cinnabar-500">permanently deleted</span>, then replaced with the {validRows.length} item{validRows.length !== 1 ? "s" : ""} in this file. This cannot be undone.
                  </p>
                </div>
              </label>
            </div>
          )}

          {importError && (
            <div className="bg-cinnabar-50 border border-cinnabar-200 rounded-xl px-4 py-3 text-sm text-cinnabar-600">
              {importError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-black-100 bg-white md:rounded-b-2xl">
          <button
            onClick={handleImport}
            disabled={validRows.length === 0 || importing || importDone}
            className={cn(
              "w-full disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors duration-200 cursor-pointer",
              importMode === "replace"
                ? "bg-cinnabar-500 hover:bg-cinnabar-400"
                : "bg-purple-500 hover:bg-purple-400"
            )}
          >
            {importing
              ? "Importing…"
              : importDone
              ? `${importMode === "replace" ? "Menu replaced" : "Imported"} — ${validRows.length} item${validRows.length !== 1 ? "s" : ""}`
              : validRows.length > 0
              ? importMode === "replace"
                ? `Replace menu with ${validRows.length} item${validRows.length !== 1 ? "s" : ""}`
                : `Add ${validRows.length} item${validRows.length !== 1 ? "s" : ""} to menu`
              : "Select a CSV file first"}
          </button>
        </div>
      </div>
    </div>
  );
}
