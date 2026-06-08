/**
 * ScreenHeader — the brand's standard chrome for pushed detail screens.
 *
 * After the (owner) area was restructured into a stack hosting the bottom tabs
 * plus pushed secondary screens, the pushed screens render with
 * `headerShown: false` and NO SafeAreaView around them (the SafeAreaView now
 * lives only in the (tabs) layout). So this header OWNS the top safe-area inset
 * itself via `useSafeAreaInsets()` — nothing renders under the notch/status bar.
 *
 * Layout: [back] [title / subtitle, flex 1] [right slot]. The back affordance is
 * deliberately minimal — an icon-only chevron in a soft rounded square, no
 * "Back" label. One header, applied identically across screens; that consistency
 * is the professionalism.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import { theme } from "../theme";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** When set, renders the minimal back chevron. */
  onBack?: () => void;
  /** Optional trailing action (e.g. an "Add" button). */
  right?: ReactNode;
}

export function ScreenHeader({ title, subtitle, onBack, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: theme.colors.white,
        paddingTop: insets.top + 6,
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.black[100],
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={6}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.colors.black[100] : theme.colors.black[50],
          })}
        >
          <ChevronLeft size={22} color={theme.colors.black[900]} strokeWidth={2.25} />
        </Pressable>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: theme.colors.black[900],
            letterSpacing: -0.4,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, color: theme.colors.black[400], marginTop: 2 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View>{right}</View> : null}
    </View>
  );
}
