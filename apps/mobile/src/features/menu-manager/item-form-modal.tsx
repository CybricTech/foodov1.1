/**
 * Add / edit a menu item — RN port of the web `ItemFormModal`.
 *
 * Behaviour is a 1:1 mirror of the web client's `handleSave` (read it for the
 * canonical flow). In short, on save we:
 *   1. Optionally upload a new image to the `menu-images` bucket and take its
 *      public URL (see ./image-upload).
 *   2. Insert or update the `menu_items` row. price_kobo is 0 when the item has
 *      multiple sizes (the price then lives in the size option choices).
 *   3. On EDIT, delete all existing `menu_item_options` for the item first
 *      (choices cascade), then recreate them from the form — exactly like web.
 *   4. Recreate the "size" group (required, single-select) from the size rows,
 *      then every other option group + its choices.
 *   5. Re-fetch the full item (with options+choices) and hand it back so the
 *      list updates optimistically.
 *
 * Kobo math is never hand-rolled beyond the same `* 100` the web client uses;
 * money is displayed via `formatKobo` from @foodo/utils.
 */
import { useState } from "react";
import {
  Dimensions,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  MenuCategory,
  MenuItemWithOptions,
  TypedSupabaseClient,
} from "@foodo/database";

import { theme } from "../../theme";
import { sizedImageUrl } from "../../lib/images";
import { pickMenuImage, uploadMenuImage, type PickedImage } from "./image-upload";

interface DraftChoice {
  name: string;
  priceModifierNgn: string;
  /** Set when the choice mirrors a reusable add-on item (name + availability). */
  linkedItemId: string | null;
}

/** A hidden add-on item that option choices can link to. */
export interface AddonRef {
  id: string;
  name: string;
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
  supabase: TypedSupabaseClient;
  restaurantId: string;
  categories: MenuCategory[];
  item: MenuItemWithOptions | null;
  defaultCategoryId: string | null;
  /** Whether the restaurant has pre-orders enabled — Made to Order reuses
   *  that whole pipeline, so it's gated behind it here too. */
  schedulingEnabled: boolean;
  /** The restaurant's hidden add-on items, offered when filling in choices. */
  addons: AddonRef[];
  /** The reserved "Add-ons" category, if one exists yet. */
  addonCategory: MenuCategory | null;
  onClose: () => void;
  onSave: (item: MenuItemWithOptions) => void;
  /** An add-on created inline from a choice field (not via the form's save). */
  onAddonCreated: (item: MenuItemWithOptions) => void;
  onCategoryCreated: (category: MenuCategory) => void;
}

export function ItemFormModal({
  supabase,
  restaurantId,
  categories,
  item,
  defaultCategoryId,
  schedulingEnabled,
  addons,
  addonCategory,
  onClose,
  onSave,
  onAddonCreated,
  onCategoryCreated,
}: ItemFormModalProps) {
  // Hidden add-on: not sold on its own, only offered as a choice in other items.
  const [addonOnly, setAddonOnly] = useState(item?.is_addon_only ?? false);
  // Local mirror so inline-created add-ons are offered immediately.
  const [localAddons, setLocalAddons] = useState(addons);
  const [addonCatId, setAddonCatId] = useState<string | null>(addonCategory?.id ?? null);

  /** Find-or-create the reserved "Add-ons" category for this restaurant. */
  async function ensureAddonCategory(): Promise<string> {
    if (addonCatId) return addonCatId;
    const { data: cat, error: catErr } = await supabase
      .from("menu_categories")
      .insert({
        restaurant_id: restaurantId,
        name: "Add-ons",
        display_order: 999,
        is_addon_group: true,
      })
      .select("*")
      .single();
    if (catErr) throw catErr;
    setAddonCatId(cat.id);
    onCategoryCreated(cat as MenuCategory);
    return cat.id;
  }

  /** Create a hidden add-on item inline and return it for linking. */
  async function createAddon(rawName: string): Promise<AddonRef | null> {
    const addonName = rawName.trim();
    if (!addonName) return null;
    try {
      const catId = await ensureAddonCategory();
      const { data: created, error: itemErr } = await supabase
        .from("menu_items")
        .insert({
          restaurant_id: restaurantId,
          name: addonName,
          price: 0,
          price_kobo: 0,
          category_id: catId,
          is_addon_only: true,
          is_available: true,
          display_order: 0,
        })
        .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
        .single();
      if (itemErr) throw itemErr;
      const addon = { id: created.id, name: created.name };
      setLocalAddons((prev) => [...prev, addon]);
      onAddonCreated(created as unknown as MenuItemWithOptions);
      return addon;
    } catch (e: unknown) {
      setError((e as Error).message ?? "Could not create add-on");
      return null;
    }
  }

  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [categoryId, setCategoryId] = useState(
    item?.category_id ?? defaultCategoryId ?? ""
  );
  // Local image picked this session (uploaded on save); preview falls back to
  // the existing stored URL when editing.
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(item?.image_url ?? "");
  const [imageRemoved, setImageRemoved] = useState(false);
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [showNewBadge, setShowNewBadge] = useState(
    (item as { show_new_badge?: boolean } | null)?.show_new_badge ?? false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The existing "size" group is the required single-select group on a $0 item.
  const existingSizeGroup =
    item?.price_kobo === 0
      ? item.options?.find((o) => o.is_required && o.max_selections === 1)
      : undefined;

  const [hasSizes, setHasSizes] = useState(!!existingSizeGroup);
  const [sizesLabel, setSizesLabel] = useState(existingSizeGroup?.name ?? "Choose size");
  const [draftSizes, setDraftSizes] = useState<DraftSize[]>(
    existingSizeGroup?.choices.map((c) => ({
      name: c.name,
      priceNgn: c.price_modifier_kobo ? (c.price_modifier_kobo / 100).toString() : "",
    })) ?? [
      { name: "", priceNgn: "" },
      { name: "", priceNgn: "" },
    ]
  );

  const [priceNgn, setPriceNgn] = useState(
    item && item.price_kobo > 0 ? (item.price_kobo / 100).toString() : ""
  );

  // Per-item prep time (minutes). An order's estimated-ready ETA uses the longest
  // prep time across its items. Blank ⇒ platform default.
  const [prepMinutes, setPrepMinutes] = useState(
    (item as { prep_time_minutes?: number | null } | null)?.prep_time_minutes != null
      ? String((item as { prep_time_minutes?: number | null }).prep_time_minutes)
      : ""
  );

  // Made to Order (088): forces any cart containing this item into the
  // scheduled-order flow with at least this many hours' notice.
  const itemRaw = item as { is_made_to_order?: boolean; made_to_order_lead_hours?: number | null } | null;
  const [isMadeToOrder, setIsMadeToOrder] = useState(itemRaw?.is_made_to_order ?? false);
  const [madeToOrderLeadHours, setMadeToOrderLeadHours] = useState(
    itemRaw?.made_to_order_lead_hours != null ? String(itemRaw.made_to_order_lead_hours) : "24"
  );

  // Inventory tracking (091): opt-in per item, mirrors web. Purchases
  // decrement the count automatically; the item sells out at 0 — independent
  // of the availability switch. Blank quantity = start at 0.
  const [trackInventory, setTrackInventory] = useState(item?.track_inventory ?? false);
  const [stockQuantity, setStockQuantity] = useState(
    item?.stock_quantity != null ? String(item.stock_quantity) : ""
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
          priceModifierNgn: c.price_modifier_kobo
            ? (c.price_modifier_kobo / 100).toString()
            : "",
          // Keep the link, or saving would silently detach the add-on.
          linkedItemId: c.linked_item_id ?? null,
        })),
      }))
  );

  // ── Option-group editors (mirror web helpers) ────────────────────────────────
  const addOption = () =>
    setDraftOptions((prev) => [
      ...prev,
      { name: "", isRequired: false, maxSelections: null, choices: [{ name: "", priceModifierNgn: "", linkedItemId: null }] },
    ]);
  const removeOption = (oi: number) =>
    setDraftOptions((prev) => prev.filter((_, i) => i !== oi));
  const updateOption = (oi: number, patch: Partial<DraftOption>) =>
    setDraftOptions((prev) => prev.map((o, i) => (i === oi ? { ...o, ...patch } : o)));
  const addChoice = (oi: number) =>
    setDraftOptions((prev) =>
      prev.map((o, i) =>
        i === oi ? { ...o, choices: [...o.choices, { name: "", priceModifierNgn: "", linkedItemId: null }] } : o
      )
    );
  const removeChoice = (oi: number, ci: number) =>
    setDraftOptions((prev) =>
      prev.map((o, i) =>
        i === oi ? { ...o, choices: o.choices.filter((_, j) => j !== ci) } : o
      )
    );
  const updateChoice = (oi: number, ci: number, patch: Partial<DraftChoice>) =>
    setDraftOptions((prev) =>
      prev.map((o, i) =>
        i === oi
          ? { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
          : o
      )
    );

  async function handlePickImage() {
    setError("");
    try {
      const picked = await pickMenuImage();
      if (!picked) return;
      setPickedImage(picked);
      setImagePreview(picked.uri);
      setImageRemoved(false);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Could not open the photo library.");
    }
  }

  function handleRemoveImage() {
    setPickedImage(null);
    setImagePreview("");
    setImageRemoved(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    // Add-ons carry no price/sizes of their own — their cost is set per choice.
    if (addonOnly) {
      // nothing to validate
    } else if (hasSizes) {
      const validSizes = draftSizes.filter((s) => s.name.trim() && s.priceNgn);
      if (validSizes.length < 2) {
        setError("Add at least 2 sizes");
        return;
      }
    } else if (!priceNgn || isNaN(parseFloat(priceNgn))) {
      setError("Valid price required");
      return;
    }
    if (!addonOnly && isMadeToOrder) {
      const hours = parseInt(madeToOrderLeadHours, 10);
      if (!madeToOrderLeadHours.trim() || !Number.isFinite(hours) || hours <= 0) {
        setError("Enter how many hours' notice this item needs");
        return;
      }
    }
    if (trackInventory && stockQuantity.trim()) {
      const qty = parseInt(stockQuantity, 10);
      if (!Number.isFinite(qty) || qty < 0) {
        setError("Stock quantity must be a whole number, 0 or more");
        return;
      }
    }

    setSaving(true);
    setError("");

    try {
      // 1. Resolve the image URL. Upload a freshly-picked image; otherwise keep
      //    the existing one (or clear it if the merchant removed it).
      let imageUrl = imageRemoved ? null : item?.image_url ?? null;
      if (pickedImage) {
        imageUrl = await uploadMenuImage(supabase, restaurantId, pickedImage);
      }

      const priceKobo = addonOnly ? 0 : hasSizes ? 0 : Math.round(parseFloat(priceNgn) * 100);
      // Add-on items live in the reserved "Add-ons" category and never appear on
      // the storefront, so featured/NEW are forced off.
      const resolvedCategoryId = addonOnly ? await ensureAddonCategory() : categoryId || null;
      const payload = {
        restaurant_id: restaurantId,
        name: name.trim(),
        description: description.trim() || null,
        price_kobo: priceKobo,
        category_id: resolvedCategoryId,
        image_url: imageUrl,
        is_featured: addonOnly ? false : isFeatured,
        show_new_badge: addonOnly ? false : showNewBadge,
        is_addon_only: addonOnly,
        prep_time_minutes: prepMinutes.trim() ? parseInt(prepMinutes, 10) || null : null,
        is_made_to_order: addonOnly ? false : isMadeToOrder,
        made_to_order_lead_hours:
          !addonOnly && isMadeToOrder ? parseInt(madeToOrderLeadHours, 10) : null,
        track_inventory: trackInventory,
        stock_quantity: trackInventory
          ? Math.max(0, parseInt(stockQuantity, 10) || 0)
          : null,
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
        // Recreate options from scratch (choices cascade on delete) — like web.
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

      // 2. Size group → required, single-select option with one choice per size.
      if (!addonOnly && hasSizes) {
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

      // 3. Every other option group + its choices.
      for (const opt of addonOnly ? [] : draftOptions) {
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

        const validChoices = opt.choices.filter((c) => c.name.trim() || c.linkedItemId);
        if (validChoices.length > 0) {
          const { error: choiceError } = await supabase
            .from("menu_item_option_choices")
            .insert(
              validChoices.map((c) => ({
                restaurant_id: restaurantId,
                option_id: optRow.id,
                name: c.name.trim(),
                price_modifier_kobo: Math.round(parseFloat(c.priceModifierNgn || "0") * 100),
                is_available: true,
                // Linked choices mirror their add-on item; the DB trigger
                // overrides name + is_available from that item at write time.
                linked_item_id: c.linkedItemId ?? null,
              }))
            );
          if (choiceError) throw choiceError;
        }
      }

      // 4. Re-fetch the full item so the list reflects the saved options.
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
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{item ? "Edit item" : "Add menu item"}</Text>
              <Text style={styles.sheetSubtitle}>
                {item ? "Update this item's details" : "Fill in the details below"}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ padding: 20, gap: 18 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name */}
            <Field label="Item name">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Jollof Rice"
                placeholderTextColor={theme.colors.black[400]}
                style={styles.input}
              />
            </Field>

            {/* Description */}
            <Field label="Description (optional)">
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Short description…"
                placeholderTextColor={theme.colors.black[400]}
                multiline
                style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
              />
            </Field>

            {/* Hidden add-on */}
            <ToggleRow
              value={addonOnly}
              onValueChange={setAddonOnly}
              title="Hidden add-on"
              subtitle="Not sold on its own — only offered as a choice in other items"
            />

            {!addonOnly && (
            <>
            {/* Sizes toggle */}
            <ToggleRow
              value={hasSizes}
              onValueChange={setHasSizes}
              title="Multiple sizes / portions"
            />

            {hasSizes ? (
              <View style={{ gap: 12 }}>
                <Field label="Size label">
                  <TextInput
                    value={sizesLabel}
                    onChangeText={setSizesLabel}
                    placeholder="e.g. Choose size"
                    placeholderTextColor={theme.colors.black[400]}
                    style={styles.input}
                  />
                </Field>
                <CategoryPicker
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                />
                <View style={{ gap: 8 }}>
                  <Text style={styles.smallLabel}>Sizes & prices</Text>
                  {draftSizes.map((size, si) => (
                    <View key={si} style={styles.rowGap}>
                      <TextInput
                        value={size.name}
                        onChangeText={(t) =>
                          setDraftSizes((prev) =>
                            prev.map((s, i) => (i === si ? { ...s, name: t } : s))
                          )
                        }
                        placeholder="e.g. 6 pieces"
                        placeholderTextColor={theme.colors.black[400]}
                        style={[styles.input, { flex: 1 }]}
                      />
                      <View style={styles.priceWrap}>
                        <Text style={styles.naira}>₦</Text>
                        <TextInput
                          value={size.priceNgn}
                          onChangeText={(t) =>
                            setDraftSizes((prev) =>
                              prev.map((s, i) => (i === si ? { ...s, priceNgn: t } : s))
                            )
                          }
                          keyboardType="numeric"
                          placeholder="2000"
                          placeholderTextColor={theme.colors.black[400]}
                          style={[styles.input, { width: 88 }]}
                        />
                      </View>
                      {draftSizes.length > 2 && (
                        <Pressable
                          onPress={() =>
                            setDraftSizes((prev) => prev.filter((_, i) => i !== si))
                          }
                          hitSlop={6}
                          style={styles.iconBtn}
                        >
                          <Text style={styles.removeX}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable
                    onPress={() =>
                      setDraftSizes((prev) => [...prev, { name: "", priceNgn: "" }])
                    }
                  >
                    <Text style={styles.addLink}>＋ Add size</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Field label="Price (₦)">
                  <TextInput
                    value={priceNgn}
                    onChangeText={setPriceNgn}
                    keyboardType="numeric"
                    placeholder="1500"
                    placeholderTextColor={theme.colors.black[400]}
                    style={styles.input}
                  />
                </Field>
                <CategoryPicker
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </View>
            )}

            {/* Prep time — the order's estimated-ready ETA uses the longest prep
                time across its items. */}
            <Field label="Prep time (minutes, optional)">
              <TextInput
                value={prepMinutes}
                onChangeText={setPrepMinutes}
                keyboardType="numeric"
                placeholder="e.g. 20"
                placeholderTextColor={theme.colors.black[400]}
                style={styles.input}
              />
              <Text style={styles.photoSub}>
                How long this takes to prepare. Leave blank to use your default.
              </Text>
            </Field>

            {/* Made to Order — forces this item into the scheduled-order flow
                with a minimum lead time (custom cakes, whole roasts, etc.).
                Needs pre-orders enabled first since it reuses that pipeline. */}
            <View style={{ gap: 6 }}>
              <View style={{ opacity: schedulingEnabled ? 1 : 0.5 }} pointerEvents={schedulingEnabled ? "auto" : "none"}>
                <ToggleRow
                  value={isMadeToOrder}
                  onValueChange={setIsMadeToOrder}
                  title="Made to Order"
                  subtitle={'Customer must book ahead — can’t order this "now"'}
                />
              </View>
              {!schedulingEnabled && (
                <Text style={styles.photoSub}>
                  Enable pre-orders in Settings → Pre-orders first to use this.
                </Text>
              )}
              {schedulingEnabled && isMadeToOrder && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <TextInput
                    value={madeToOrderLeadHours}
                    onChangeText={setMadeToOrderLeadHours}
                    keyboardType="numeric"
                    placeholder="24"
                    placeholderTextColor={theme.colors.black[400]}
                    style={[styles.input, { width: 72 }]}
                  />
                  <Text style={styles.photoSub}>hours ahead, minimum</Text>
                </View>
              )}
            </View>

            {/* Track stock (091) — opt-in inventory. Each paid order decrements
                the count; at 0 the item sells out automatically. The on/off
                availability switch stays independent. */}
            <View style={{ gap: 6 }}>
              <ToggleRow
                value={trackInventory}
                onValueChange={setTrackInventory}
                title="Track stock"
                subtitle="Count down as customers buy — sells out automatically at 0"
              />
              {trackInventory && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <TextInput
                    value={stockQuantity}
                    onChangeText={setStockQuantity}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.colors.black[400]}
                    style={[styles.input, { width: 72 }]}
                  />
                  <Text style={styles.photoSub}>units available</Text>
                </View>
              )}
            </View>
            </>
            )}

            {/* Photo */}
            <Field label="Photo (max 5MB)">
              <Pressable onPress={handlePickImage} style={styles.photoBox}>
                {imagePreview ? (
                  <Image
                    // A freshly picked photo is a local file and passes through
                    // unchanged; a saved one is fetched at preview size.
                    source={{ uri: sizedImageUrl(imagePreview, Dimensions.get("window").width, 144) }}
                    style={{ width: "100%", height: 144, borderRadius: 12 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={{ alignItems: "center", gap: 6, paddingVertical: 28 }}>
                    <Text style={{ fontSize: 22 }}>🖼️</Text>
                    <Text style={styles.photoHint}>Tap to upload photo</Text>
                    <Text style={styles.photoSub}>JPG, PNG or WebP</Text>
                  </View>
                )}
              </Pressable>
              {imagePreview ? (
                <Pressable onPress={handleRemoveImage}>
                  <Text style={[styles.addLink, { color: theme.colors.cinnabar[500] }]}>
                    Remove photo
                  </Text>
                </Pressable>
              ) : null}
            </Field>

            {!addonOnly && (
            <>
            {/* Featured */}
            <ToggleRow
              value={isFeatured}
              onValueChange={setIsFeatured}
              title="Featured item"
              subtitle="Highlighted on your public menu"
              activeColor={theme.colors.gold}
            />

            {/* NEW badge */}
            <ToggleRow
              value={showNewBadge}
              onValueChange={setShowNewBadge}
              title='Show "NEW" badge'
              subtitle="Display a NEW tag on this item in your storefront"
            />

            {/* Options & Add-ons */}
            <View style={{ gap: 12 }}>
              <View style={styles.optionsHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionsTitle}>Options & Add-ons</Text>
                  <Text style={styles.optionsSub}>e.g. Choose Protein, Add Extras</Text>
                </View>
                <Pressable onPress={addOption} style={styles.addGroupBtn}>
                  <Text style={styles.addGroupText}>＋ Add group</Text>
                </Pressable>
              </View>

              {draftOptions.map((opt, oi) => (
                <View key={oi} style={styles.optionCard}>
                  <View style={styles.rowGap}>
                    <TextInput
                      value={opt.name}
                      onChangeText={(t) => updateOption(oi, { name: t })}
                      placeholder="Group name (e.g. Choose Protein)"
                      placeholderTextColor={theme.colors.black[400]}
                      style={[styles.input, { flex: 1, backgroundColor: theme.colors.white }]}
                    />
                    <Pressable onPress={() => removeOption(oi)} hitSlop={6} style={styles.iconBtn}>
                      <Text style={styles.removeX}>✕</Text>
                    </Pressable>
                  </View>

                  {/* Group settings */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                    <CheckRow
                      label="Required"
                      checked={opt.isRequired}
                      onToggle={() => updateOption(oi, { isRequired: !opt.isRequired })}
                    />
                    <CheckRow
                      label="Limit to"
                      checked={opt.maxSelections !== null}
                      onToggle={() =>
                        updateOption(oi, {
                          maxSelections: opt.maxSelections !== null ? null : 1,
                        })
                      }
                    />
                    {opt.maxSelections !== null && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <TextInput
                          value={String(opt.maxSelections)}
                          onChangeText={(t) =>
                            updateOption(oi, { maxSelections: parseInt(t, 10) || 1 })
                          }
                          keyboardType="numeric"
                          style={[styles.input, { width: 48, textAlign: "center", paddingVertical: 6, backgroundColor: theme.colors.white }]}
                        />
                        <Text style={styles.photoSub}>max</Text>
                      </View>
                    )}
                  </View>

                  {/* Choices */}
                  <View style={{ gap: 8 }}>
                    {opt.choices.map((choice, ci) => (
                      <View key={ci} style={[styles.rowGap, { alignItems: "flex-start" }]}>
                        <ChoiceField
                          value={choice}
                          addons={localAddons.filter((a) => a.id !== item?.id)}
                          onPick={(addon) =>
                            updateChoice(oi, ci, { linkedItemId: addon.id, name: addon.name })
                          }
                          onCreate={async (n) => {
                            const created = await createAddon(n);
                            if (created) {
                              updateChoice(oi, ci, { linkedItemId: created.id, name: created.name });
                            }
                            return created;
                          }}
                          onTypeFreeText={(n) => updateChoice(oi, ci, { name: n, linkedItemId: null })}
                          onClear={() => updateChoice(oi, ci, { linkedItemId: null, name: "" })}
                        />
                        <View style={styles.priceWrap}>
                          <Text style={styles.naira}>+₦</Text>
                          <TextInput
                            value={choice.priceModifierNgn}
                            onChangeText={(t) => updateChoice(oi, ci, { priceModifierNgn: t })}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={theme.colors.black[400]}
                            style={[styles.input, { width: 64, textAlign: "right", paddingVertical: 8, backgroundColor: theme.colors.white }]}
                          />
                        </View>
                        <Pressable onPress={() => removeChoice(oi, ci)} hitSlop={6} style={styles.iconBtn}>
                          <Text style={styles.removeX}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Pressable onPress={() => addChoice(oi)}>
                      <Text style={styles.addLink}>＋ Add choice</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            </>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {item ? "Save changes" : "Add item"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

/**
 * A choice that can link to a reusable add-on item (web `ChoiceCombobox`).
 * Type to search existing add-ons, pick one (the choice then mirrors its name +
 * availability), or create a new add-on inline. Typing without picking keeps it
 * as plain free text.
 */
function ChoiceField({
  value,
  addons,
  onPick,
  onCreate,
  onTypeFreeText,
  onClear,
}: {
  value: DraftChoice;
  addons: AddonRef[];
  onPick: (addon: AddonRef) => void;
  onCreate: (name: string) => Promise<AddonRef | null>;
  onTypeFreeText: (name: string) => void;
  onClear: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);

  if (value.linkedItemId) {
    return (
      <View style={styles.linkedChip}>
        <Text style={styles.linkedGlyph}>🔗</Text>
        <Text numberOfLines={1} style={styles.linkedName}>{value.name}</Text>
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Unlink add-on">
          <Text style={styles.linkedX}>✕</Text>
        </Pressable>
      </View>
    );
  }

  const q = value.name.trim().toLowerCase();
  const matches = addons.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6);
  const exact = addons.some((a) => a.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;
  const open = focused && (matches.length > 0 || canCreate);

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <TextInput
        value={value.name}
        onChangeText={onTypeFreeText}
        onFocus={() => setFocused(true)}
        // Delay so a tap on a suggestion lands before the list unmounts.
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder="Choice or add-on (e.g. Chicken)"
        placeholderTextColor={theme.colors.black[400]}
        style={[styles.input, { paddingVertical: 8, backgroundColor: theme.colors.white }]}
      />
      {open && (
        <View style={styles.suggestBox}>
          {matches.map((a) => (
            <Pressable key={a.id} onPress={() => onPick(a)} style={styles.suggestRow}>
              <Text numberOfLines={1} style={styles.suggestText}>🔗 {a.name}</Text>
            </Pressable>
          ))}
          {canCreate && (
            <Pressable
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                await onCreate(value.name);
                setBusy(false);
              }}
              style={[styles.suggestRow, busy && { opacity: 0.6 }]}
            >
              <Text numberOfLines={1} style={[styles.suggestText, { color: theme.colors.brand, fontWeight: "600" }]}>
                {busy ? "Creating…" : `＋ Create “${value.name.trim()}” as add-on`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  value,
  onValueChange,
  title,
  subtitle,
  activeColor,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  activeColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.black[200], true: activeColor ?? theme.colors.brand }}
        thumbColor={theme.colors.white}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[900] }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: checked ? theme.colors.brand : theme.colors.black[400],
          backgroundColor: checked ? theme.colors.brand : theme.colors.white,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Text style={{ color: theme.colors.white, fontSize: 11, fontWeight: "900" }}>✓</Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.black[500] }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Inline chip-style category picker (RN has no native <select>). */
function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: MenuCategory[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <CatChip label="No category" active={value === ""} onPress={() => onChange("")} />
        {categories.map((c) => (
          <CatChip
            key={c.id}
            label={c.name}
            active={value === c.id}
            onPress={() => onChange(c.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CatChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.colors.brand : theme.colors.black[200],
        backgroundColor: active ? theme.colors.primary[50] : theme.colors.white,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? theme.colors.brand : theme.colors.black[500],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = {
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,17,17,0.5)",
    justifyContent: "flex-end" as const,
  },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%" as const,
    overflow: "hidden" as const,
  },
  sheetHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
  },
  sheetTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900] },
  sheetSubtitle: { fontSize: 12, color: theme.colors.black[400], marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 8,
  },
  closeBtnText: { fontSize: 16, color: theme.colors.black[400] },
  label: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
  smallLabel: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: theme.colors.black[500],
    textTransform: "uppercase" as const,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.black[900],
    backgroundColor: theme.colors.white,
  },
  rowGap: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  priceWrap: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
  naira: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  removeX: { fontSize: 14, color: theme.colors.black[400] },
  addLink: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.brand },
  linkedChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary[200],
    backgroundColor: theme.colors.primary[50],
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  linkedGlyph: { fontSize: 12 },
  linkedName: { flex: 1, fontSize: 14, fontWeight: "600" as const, color: theme.colors.brandDark },
  linkedX: { fontSize: 13, color: theme.colors.brand, fontWeight: "700" as const },
  suggestBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    backgroundColor: theme.colors.white,
    overflow: "hidden" as const,
  },
  suggestRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
  },
  suggestText: { fontSize: 13, color: theme.colors.black[900] },
  photoBox: {
    borderWidth: 2,
    borderColor: theme.colors.black[200],
    borderStyle: "dashed" as const,
    borderRadius: 12,
    overflow: "hidden" as const,
  },
  photoHint: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[500] },
  photoSub: { fontSize: 11, color: theme.colors.black[400] },
  optionsHeader: { flexDirection: "row" as const, alignItems: "center" as const },
  optionsTitle: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900] },
  optionsSub: { fontSize: 12, color: theme.colors.black[400] },
  addGroupBtn: {
    backgroundColor: theme.colors.primary[50],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addGroupText: { fontSize: 12, fontWeight: "700" as const, color: theme.colors.brand },
  optionCard: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    padding: 14,
    gap: 12,
    backgroundColor: theme.colors.black[50],
  },
  errorBox: {
    backgroundColor: theme.colors.cinnabar[100],
    borderWidth: 1,
    borderColor: theme.colors.cinnabar[500],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: { fontSize: 13, color: theme.colors.cinnabar[500] },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.black[100],
    backgroundColor: theme.colors.white,
  },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" as const, color: theme.colors.white },
};
