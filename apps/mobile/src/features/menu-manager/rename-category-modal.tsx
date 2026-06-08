/**
 * Rename a category — the RN equivalent of web's inline double-click rename.
 *
 * Web does an optimistic `menu_categories.update({ name })` with revert on
 * failure; on mobile we collect the new name in a small sheet and hand it back
 * to the parent, which performs the same optimistic update + revert.
 */
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { theme } from "../../theme";

interface RenameCategoryModalProps {
  initialName: string;
  onClose: () => void;
  onSubmit: (newName: string) => void;
}

export function RenameCategoryModal({
  initialName,
  onClose,
  onSubmit,
}: RenameCategoryModalProps) {
  const [value, setValue] = useState(initialName);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Rename category</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            <TextInput
              value={value}
              onChangeText={setValue}
              autoFocus
              selectTextOnFocus
              placeholderTextColor={theme.colors.black[400]}
              style={styles.input}
            />
            <Pressable onPress={() => onSubmit(value)} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Save</Text>
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
  input: {
    borderWidth: 1,
    borderColor: theme.colors.black[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.colors.black[900],
  },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" as const, color: theme.colors.white },
};
