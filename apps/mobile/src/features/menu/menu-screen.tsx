/**
 * Frontline menu — RN port of the web `FrontlineMenuClient`.
 *
 * Loads categories + items for the restaurant, supports search + category
 * filter, and toggles `menu_items.is_available` directly via Supabase (RLS-
 * protected) with optimistic update + revert — the EXACT table/column the web
 * frontline writes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { formatKobo } from "@foodo/utils";
import type { MenuCategory } from "@foodo/database";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";

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

interface MenuScreenProps {
  restaurantId: string;
  accountName?: string;
  onSignOut?: () => void;
}

export function MenuScreen({ restaurantId, accountName, onSignOut }: MenuScreenProps) {
  const supabase = getSupabase();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const [{ data: cats }, { data: its }] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("display_order", { ascending: true }),
        supabase
          .from("menu_items")
          .select(
            "id, name, description, price_kobo, image_url, is_available, is_featured, category_id"
          )
          .eq("restaurant_id", restaurantId)
          .order("display_order", { ascending: true }),
      ]);
      setCategories((cats ?? []) as MenuCategory[]);
      setItems((its ?? []) as MenuItem[]);
      setLoading(false);
    })();
  }, [restaurantId, supabase]);

  const toggleAvailability = useCallback(
    async (itemId: string, current: boolean) => {
      if (!supabase) return;
      setToggling(itemId);
      // Optimistic
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, is_available: !current } : i))
      );
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: !current })
        .eq("id", itemId);
      if (error) {
        // Revert
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, is_available: current } : i))
        );
      }
      setToggling(null);
    },
    [supabase]
  );

  const filteredItems = useMemo(() => {
    let result = items;
    if (activeCategory) result = result.filter((i) => i.category_id === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    return result;
  }, [items, search, activeCategory]);

  const availableCount = filteredItems.filter((i) => i.is_available).length;
  const unavailableCount = filteredItems.length - availableCount;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={{ fontSize: 19, fontWeight: "800", color: theme.colors.black[900] }}>
              Menu
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
              {availableCount} available · {unavailableCount} unavailable
            </Text>
          </View>
          {onSignOut && (
            <Pressable
              onPress={onSignOut}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.colors.black[200],
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.colors.black[500] }}>
                Sign out
              </Text>
            </Pressable>
          )}
        </View>
        {!!accountName && (
          <Text style={{ fontSize: 11, color: theme.colors.black[400], marginTop: 4 }}>
            Signed in as {accountName}
          </Text>
        )}

        {/* Search */}
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.black[50],
            borderWidth: 1,
            borderColor: theme.colors.black[200],
            borderRadius: 12,
            paddingHorizontal: 12,
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search menu items…"
            placeholderTextColor={theme.colors.black[400]}
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: theme.colors.black[900] }}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Text style={{ fontSize: 16, color: theme.colors.black[400] }}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Category pills */}
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 12 }}
          >
            <Pill
              label="All items"
              active={!activeCategory}
              onPress={() => setActiveCategory(null)}
            />
            {categories.map((cat) => (
              <Pill
                key={cat.id}
                label={cat.name}
                active={activeCategory === cat.id}
                onPress={() => setActiveCategory(cat.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Items */}
      <FlatList
        data={filteredItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 64 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[500] }}>
              {search ? "No items match your search" : "No menu items yet"}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: theme.colors.black[100] }} />
        )}
        renderItem={({ item }) => {
          const categoryName =
            categories.find((c) => c.id === item.category_id)?.name ?? null;
          return (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 12,
                backgroundColor: theme.colors.white,
                opacity: item.is_available ? 1 : 0.6,
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: item.is_available
                        ? theme.colors.black[900]
                        : theme.colors.black[400],
                      flexShrink: 1,
                    }}
                  >
                    {item.name}
                  </Text>
                  {item.is_featured && (
                    <Text style={{ fontSize: 12, color: theme.colors.gold }}>★</Text>
                  )}
                  {!item.is_available && (
                    <View
                      style={{
                        backgroundColor: theme.colors.cinnabar[100],
                        borderRadius: 999,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: theme.colors.cinnabar[500],
                        }}
                      >
                        Unavailable
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: theme.colors.black[500], marginTop: 2 }}>
                  {item.price_kobo === 0 ? "Multiple sizes" : formatKobo(item.price_kobo)}
                  {categoryName ? `  ·  ${categoryName}` : ""}
                </Text>
              </View>
              <Switch
                value={item.is_available}
                disabled={toggling === item.id}
                onValueChange={() => toggleAvailability(item.id, item.is_available)}
                trackColor={{ false: theme.colors.black[200], true: theme.colors.viridian[500] }}
                thumbColor={theme.colors.white}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

function Pill({
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
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: active ? theme.colors.brand : theme.colors.black[100],
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: active ? "#fff" : theme.colors.black[500],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
