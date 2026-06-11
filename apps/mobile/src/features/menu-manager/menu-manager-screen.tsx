/**
 * Owner Menu Manager — RN port of the web `MenuManagerClient` (full CRUD).
 *
 * Parity with web (read components/dashboard/menu-manager-client.tsx for the
 * canonical behaviour). All reads/writes go through the authed `getSupabase()`
 * client directly (RLS), the SAME four tables the web client uses:
 *   - menu_categories            (create / rename / reorder / delete)
 *   - menu_items                 (create / edit / delete / availability / featured)
 *   - menu_item_options          (option groups + the "size" group)
 *   - menu_item_option_choices   (choices, each with a kobo price modifier)
 *
 * Ported behaviours:
 *   - Initial load: same two queries as the web menu page (categories ordered by
 *     display_order; items + nested options/choices, ordered by display_order).
 *   - Category pills filter the item list (mirrors web mobile layout).
 *   - Per-item availability toggle → menu_items.is_available (optimistic).
 *   - Delete item / category with confirm; category delete is blocked while it
 *     still has items (same guard + message as web).
 *   - Featured reorder: normalize featured_order to index and persist every row
 *     (same algorithm as web `moveFeatured`).
 *   - Category reorder up/down: persist display_order for all categories.
 *   - Add / edit item and add / rename category via sheets.
 *
 * Out of scope for this run (kept on web only): CSV import/export. Money is
 * always rendered via `formatKobo` from @foodo/utils.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

import { formatKobo } from "@foodo/utils";
import type { MenuCategory, MenuItemWithOptions } from "@foodo/database";

import { router } from "expo-router";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";
import { ScreenHeader } from "../../components/screen-header";
import { ItemFormModal } from "./item-form-modal";
import { AddCategoryModal } from "./add-category-modal";
import { RenameCategoryModal } from "./rename-category-modal";

interface MenuManagerScreenProps {
  restaurantId: string;
}

export function MenuManagerScreen({ restaurantId }: MenuManagerScreenProps) {
  const supabase = getSupabase();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItemWithOptions[]>([]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [manageCategories, setManageCategories] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);

  // Modals
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemWithOptions | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState<MenuCategory | null>(null);

  // ── Initial load (same queries as the web menu page) ─────────────────────────
  const load = useCallback(async () => {
    if (!supabase) {
      setLoadError("App is not configured.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    const [{ data: cats, error: catErr }, { data: its, error: itemErr }] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("display_order", { ascending: true }),
      supabase
        .from("menu_items")
        .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
        .eq("restaurant_id", restaurantId)
        .order("display_order", { ascending: true }),
    ]);
    if (catErr || itemErr) {
      setLoadError((catErr ?? itemErr)?.message ?? "Could not load your menu.");
      setLoading(false);
      return;
    }
    const loadedCats = (cats ?? []) as MenuCategory[];
    setCategories(loadedCats);
    setItems((its as unknown as MenuItemWithOptions[]) ?? []);
    setActiveCategory((prev) => prev ?? loadedCats[0]?.id ?? null);
    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Featured items, ordered for the storefront carousel (web parity) ─────────
  const featuredItems = useMemo(
    () =>
      items
        .filter((i) => i.is_featured)
        .sort(
          (a, b) =>
            a.featured_order - b.featured_order ||
            Date.parse(b.created_at) - Date.parse(a.created_at)
        ),
    [items]
  );

  async function moveFeatured(itemId: string, direction: "up" | "down") {
    if (reorderBusy || !supabase) return;
    const ordered = [...featuredItems];
    const idx = ordered.findIndex((i) => i.id === itemId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];

    setReorderBusy(true);
    const orderMap = new Map(ordered.map((it, i) => [it.id, i]));
    setItems((prev) =>
      prev.map((it) =>
        orderMap.has(it.id) ? { ...it, featured_order: orderMap.get(it.id)! } : it
      )
    );
    await Promise.all(
      ordered.map((it, i) =>
        supabase.from("menu_items").update({ featured_order: i }).eq("id", it.id)
      )
    );
    setReorderBusy(false);
  }

  // ── Item availability toggle (optimistic + revert, like web frontline) ───────
  const toggleAvailable = useCallback(
    async (itemId: string, current: boolean) => {
      if (!supabase) return;
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, is_available: !current } : i))
      );
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: !current })
        .eq("id", itemId);
      if (error) {
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, is_available: current } : i))
        );
      }
    },
    [supabase]
  );

  function deleteItem(itemId: string) {
    Alert.alert("Delete item", "Delete this menu item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!supabase) return;
          await supabase.from("menu_items").delete().eq("id", itemId);
          setItems((prev) => prev.filter((i) => i.id !== itemId));
        },
      },
    ]);
  }

  // ── Category mutations (web parity) ──────────────────────────────────────────
  async function renameCategory(catId: string, newName: string) {
    const trimmed = newName.trim();
    const current = categories.find((c) => c.id === catId);
    setRenamingCategory(null);
    if (!trimmed || trimmed === current?.name || !supabase) return;
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, name: trimmed } : c))
    );
    const { error } = await supabase
      .from("menu_categories")
      .update({ name: trimmed })
      .eq("id", catId);
    if (error) {
      setCategories((prev) =>
        prev.map((c) => (c.id === catId ? { ...c, name: current?.name ?? c.name } : c))
      );
      Alert.alert("Rename failed", "Could not rename category. Please try again.");
    }
  }

  function deleteCategory(catId: string) {
    const hasItems = items.some((i) => i.category_id === catId);
    if (hasItems) {
      Alert.alert("Category not empty", "Move or delete all items in this category first.");
      return;
    }
    Alert.alert("Delete category", "Delete this category?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!supabase) return;
          await supabase.from("menu_categories").delete().eq("id", catId);
          setCategories((prev) => prev.filter((c) => c.id !== catId));
          if (activeCategory === catId) {
            setActiveCategory(categories.find((c) => c.id !== catId)?.id ?? null);
          }
        },
      },
    ]);
  }

  async function moveCategory(catId: string, direction: "up" | "down") {
    if (reorderBusy || !supabase) return;
    const ordered = [...categories];
    const idx = ordered.findIndex((c) => c.id === catId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];

    setReorderBusy(true);
    const reindexed = ordered.map((c, i) => ({ ...c, display_order: i }));
    setCategories(reindexed);
    await Promise.all(
      reindexed.map((c) =>
        supabase.from("menu_categories").update({ display_order: c.display_order }).eq("id", c.id)
      )
    );
    setReorderBusy(false);
  }

  const categoryItems = useMemo(
    () => items.filter((i) => i.category_id === activeCategory),
    [items, activeCategory]
  );

  // ── Item save handler shared by add/edit ─────────────────────────────────────
  function handleItemSaved(saved: MenuItemWithOptions) {
    setItems((prev) =>
      editingItem
        ? prev.map((i) => (i.id === saved.id ? saved : i))
        : [...prev, saved]
    );
    setShowAddItem(false);
    setEditingItem(null);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 14, color: theme.colors.cinnabar[500], textAlign: "center" }}>
          {loadError}
        </Text>
        <Pressable onPress={() => { setLoading(true); void load(); }} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      <ScreenHeader
        title="Menu"
        subtitle={`${items.length} item${items.length !== 1 ? "s" : ""} · ${categories.length} categor${categories.length !== 1 ? "ies" : "y"}`}
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => setShowAddItem(true)} style={styles.addItemBtn}>
            <Text style={styles.addItemText}>＋ Add item</Text>
          </Pressable>
        }
      />

      <FlatList
        data={categoryItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            {/* Featured order */}
            {featuredItems.length >= 2 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>★ Featured order</Text>
                <Text style={styles.sectionSub}>
                  The order these appear in your storefront "Featured" carousel.
                </Text>
                <View style={{ gap: 8, marginTop: 10 }}>
                  {featuredItems.map((item, idx) => (
                    <View key={item.id} style={styles.featuredRow}>
                      <Text style={styles.featuredIdx}>{idx + 1}</Text>
                      <Thumb url={item.image_url} available />
                      <Text style={styles.featuredName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Pressable
                        onPress={() => moveFeatured(item.id, "up")}
                        disabled={idx === 0 || reorderBusy}
                        hitSlop={6}
                        style={[styles.moveBtn, (idx === 0 || reorderBusy) && { opacity: 0.3 }]}
                      >
                        <Text style={styles.moveArrow}>▲</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => moveFeatured(item.id, "down")}
                        disabled={idx === featuredItems.length - 1 || reorderBusy}
                        hitSlop={6}
                        style={[
                          styles.moveBtn,
                          (idx === featuredItems.length - 1 || reorderBusy) && { opacity: 0.3 },
                        ]}
                      >
                        <Text style={styles.moveArrow}>▼</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Category pills + manage toggle */}
            <View style={styles.categoryBar}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.smallCaps}>Categories</Text>
                {categories.length > 0 && (
                  <Pressable onPress={() => setManageCategories((m) => !m)} hitSlop={6}>
                    <Text style={styles.manageLink}>
                      {manageCategories ? "Done" : "Manage"}
                    </Text>
                  </Pressable>
                )}
              </View>

              {manageCategories ? (
                <View style={{ gap: 8, marginTop: 10 }}>
                  {categories.map((cat, idx) => {
                    const count = items.filter((i) => i.category_id === cat.id).length;
                    return (
                      <View key={cat.id} style={styles.manageRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.manageName} numberOfLines={1}>
                            {cat.name}
                          </Text>
                          <Text style={styles.manageCount}>
                            {count} item{count !== 1 ? "s" : ""}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => moveCategory(cat.id, "up")}
                          disabled={idx === 0 || reorderBusy}
                          hitSlop={6}
                          style={[styles.moveBtn, (idx === 0 || reorderBusy) && { opacity: 0.3 }]}
                        >
                          <Text style={styles.moveArrow}>▲</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => moveCategory(cat.id, "down")}
                          disabled={idx === categories.length - 1 || reorderBusy}
                          hitSlop={6}
                          style={[
                            styles.moveBtn,
                            (idx === categories.length - 1 || reorderBusy) && { opacity: 0.3 },
                          ]}
                        >
                          <Text style={styles.moveArrow}>▼</Text>
                        </Pressable>
                        <Pressable onPress={() => setRenamingCategory(cat)} hitSlop={6} style={styles.moveBtn}>
                          <Text style={styles.editGlyph}>✎</Text>
                        </Pressable>
                        <Pressable onPress={() => deleteCategory(cat.id)} hitSlop={6} style={styles.moveBtn}>
                          <Text style={styles.deleteGlyph}>🗑</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  <Pressable onPress={() => setShowAddCategory(true)} style={styles.addCatRow}>
                    <Text style={styles.addCatText}>＋ Add category</Text>
                  </Pressable>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, marginTop: 10 }}
                >
                  {categories.map((cat) => {
                    const active = activeCategory === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setActiveCategory(cat.id)}
                        style={[styles.pill, active ? styles.pillActive : styles.pillIdle]}
                      >
                        <Text style={active ? styles.pillActiveText : styles.pillIdleText}>
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable onPress={() => setShowAddCategory(true)} style={styles.pillAdd}>
                    <Text style={styles.pillAddText}>＋ Category</Text>
                  </Pressable>
                </ScrollView>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>Add your first item to this category</Text>
            <Pressable onPress={() => setShowAddItem(true)} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>＋ Add item</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Thumb url={item.image_url} available={item.is_available} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.itemName,
                    !item.is_available && { color: theme.colors.black[400] },
                  ]}
                >
                  {item.name}
                </Text>
                {item.is_featured && <Text style={{ fontSize: 12, color: theme.colors.gold }}>★</Text>}
                {!item.is_available && (
                  <View style={styles.offBadge}>
                    <Text style={styles.offBadgeText}>Off</Text>
                  </View>
                )}
              </View>
              <Text style={styles.itemPrice}>
                {item.price_kobo === 0 ? "Multiple sizes" : formatKobo(item.price_kobo)}
              </Text>
            </View>
            <Switch
              value={item.is_available}
              onValueChange={() => toggleAvailable(item.id, item.is_available)}
              trackColor={{ false: theme.colors.black[200], true: theme.colors.brand }}
              thumbColor={theme.colors.white}
            />
            <Pressable onPress={() => setEditingItem(item)} hitSlop={6} style={styles.moveBtn}>
              <Text style={styles.editGlyph}>✎</Text>
            </Pressable>
            <Pressable onPress={() => deleteItem(item.id)} hitSlop={6} style={styles.moveBtn}>
              <Text style={styles.deleteGlyph}>🗑</Text>
            </Pressable>
          </View>
        )}
      />

      {/* Modals */}
      {(showAddItem || editingItem) && supabase && (
        <ItemFormModal
          supabase={supabase}
          restaurantId={restaurantId}
          categories={categories}
          item={editingItem}
          defaultCategoryId={activeCategory}
          onClose={() => {
            setShowAddItem(false);
            setEditingItem(null);
          }}
          onSave={handleItemSaved}
        />
      )}

      {showAddCategory && supabase && (
        <AddCategoryModal
          supabase={supabase}
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

      {renamingCategory && (
        <RenameCategoryModal
          initialName={renamingCategory.name}
          onClose={() => setRenamingCategory(null)}
          onSubmit={(newName) => renameCategory(renamingCategory.id, newName)}
        />
      )}
    </View>
  );
}

function Thumb({ url, available }: { url: string | null; available: boolean }) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: 48, height: 48, borderRadius: 12, opacity: available ? 1 : 0.5 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={styles.thumbPlaceholder}>
      <Text style={{ fontSize: 18 }}>🍽️</Text>
    </View>
  );
}

const styles = {
  addItemBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addItemText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.white },
  section: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800" as const, color: theme.colors.black[900] },
  sectionSub: { fontSize: 12, color: theme.colors.black[400], marginTop: 2 },
  featuredRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    borderRadius: 12,
    padding: 8,
  },
  featuredIdx: {
    width: 16,
    textAlign: "center" as const,
    fontSize: 12,
    fontWeight: "800" as const,
    color: theme.colors.black[400],
  },
  featuredName: { flex: 1, fontSize: 14, fontWeight: "500" as const, color: theme.colors.black[900] },
  categoryBar: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  smallCaps: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: theme.colors.black[400],
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  manageLink: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.brand },
  manageRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.black[100],
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  manageName: { fontSize: 14, fontWeight: "600" as const, color: theme.colors.black[900] },
  manageCount: { fontSize: 12, color: theme.colors.black[400], marginTop: 1 },
  addCatRow: {
    paddingVertical: 12,
    alignItems: "center" as const,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
  },
  addCatText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.brand },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillActive: { backgroundColor: theme.colors.brand },
  pillIdle: { backgroundColor: theme.colors.black[100] },
  pillActiveText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.white },
  pillIdleText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.black[500] },
  pillAdd: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: theme.colors.black[200],
  },
  pillAddText: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[400] },
  itemRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[50],
  },
  itemName: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[900], flexShrink: 1 },
  itemPrice: { fontSize: 12, color: theme.colors.black[500], marginTop: 2, fontWeight: "500" as const },
  offBadge: {
    backgroundColor: theme.colors.black[100],
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  offBadgeText: { fontSize: 10, fontWeight: "700" as const, color: theme.colors.black[400] },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.black[100],
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  moveBtn: {
    width: 32,
    height: 32,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  moveArrow: { fontSize: 13, color: theme.colors.black[500] },
  editGlyph: { fontSize: 15, color: theme.colors.black[500] },
  deleteGlyph: { fontSize: 14 },
  empty: { alignItems: "center" as const, paddingVertical: 56, gap: 8 },
  emptyTitle: { fontSize: 14, fontWeight: "700" as const, color: theme.colors.black[500] },
  emptySub: { fontSize: 12, color: theme.colors.black[400] },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: theme.colors.brand,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyBtnText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.white },
  retryBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { fontSize: 13, fontWeight: "700" as const, color: theme.colors.black[500] },
};
