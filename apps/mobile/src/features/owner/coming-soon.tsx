/**
 * Minimal "coming in next update" placeholder for owner features that ship in
 * Phase 2b (Menu editing, Marketing, Settings). Keeps navigation complete while
 * those write surfaces aren't built yet — intentionally bare.
 */
import { Text, View } from "react-native";

import { theme } from "../../theme";

export function ComingSoon({ title }: { title: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.black[50],
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: theme.colors.black[900],
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      <Text style={{ fontSize: 14, color: theme.colors.black[400], textAlign: "center" }}>
        Coming in the next update.
      </Text>
    </View>
  );
}
