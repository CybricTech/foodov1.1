/**
 * Create a menu category — RN port of the web `AddCategoryModal`.
 *
 * Inserts a `menu_categories` row (restaurant_id + name + display_order) and
 * returns the created row so the caller can append it and select it, exactly
 * like web. `display_order` is the current category count (next slot).
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import type { MenuCategory, TypedSupabaseClient } from "@foodo/database";

import { theme } from "../../theme";

interface AddCategoryModalProps {
  supabase: TypedSupabaseClient;
  restaurantId: string;
  nextOrder: number;
  onClose: () => void;
  onSave: (category: MenuCategory) => void;
}

export function AddCategoryModal({
  supabase,
  restaurantId,
  nextOrder,
  onClose,
  onSave,
}: AddCategoryModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    const { data, error: insertError } = await supabase
      .from("menu_categories")
      .insert({ restaurant_id: restaurantId, name: name.trim(), display_order: nextOrder })
      .select("*")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onSave(data as MenuCategory);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>New category</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Category name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                placeholder="e.g. Starters, Main Course, Drinks"
                placeholderTextColor={theme.colors.black[400]}
                style={styles.input}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Create category</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.black[100],
  },
  title: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.black[900] },
  close: { fontSize: 16, color: theme.colors.black[400] },
  label: { fontSize: 13, fontWeight: "600" as const, color: theme.colors.black[500] },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.colors.black[900],
  },
  error: { fontSize: 13, color: theme.colors.cinnabar[500] },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
    marginTop: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" as const, color: theme.colors.white },
};
