/**
 * Owner "More" hub — the overflow for owner destinations that don't fit the
 * bottom tab bar (mobile fits ~5 tabs; the owner has 8 destinations, mirroring
 * web's approach of surfacing primary items and tucking the rest away).
 *
 * Links:
 *   - Customers   → built (Phase 2a)
 *   - Menu        → built (Phase 2b-i)
 *   - Marketing   → built (Phase 2b-ii)
 *   - Settings    → built (Phase 2b-ii)
 *   - Frontline mode → jumps into the existing (frontline) staff queue
 *   - Sign out
 */
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Users,
  UtensilsCrossed,
  Megaphone,
  Settings,
  LogOut,
  LayoutDashboard,
  ChevronRight,
  type LucideIcon,
} from "lucide-react-native";

import { theme } from "../../theme";

interface MoreLink {
  label: string;
  description: string;
  icon: LucideIcon;
  onPress: () => void;
  badge?: string;
  destructive?: boolean;
}

interface MoreScreenProps {
  accountName: string;
  onOpenCustomers: () => void;
  onOpenMenu: () => void;
  onOpenMarketing: () => void;
  onOpenSettings: () => void;
  onEnterFrontline: () => void;
  onSignOut: () => void;
}

export function MoreScreen({
  accountName,
  onOpenCustomers,
  onOpenMenu,
  onOpenMarketing,
  onOpenSettings,
  onEnterFrontline,
  onSignOut,
}: MoreScreenProps) {
  const sections: { title: string; links: MoreLink[] }[] = [
    {
      title: "Manage",
      links: [
        {
          label: "Customers",
          description: "Browse customers and order history",
          icon: Users,
          onPress: onOpenCustomers,
        },
        {
          label: "Menu",
          description: "Edit items and categories",
          icon: UtensilsCrossed,
          onPress: onOpenMenu,
        },
        {
          label: "Marketing",
          description: "Promotions and campaigns",
          icon: Megaphone,
          onPress: onOpenMarketing,
        },
        {
          label: "Settings",
          description: "Store profile and preferences",
          icon: Settings,
          onPress: onOpenSettings,
        },
      ],
    },
    {
      title: "Workspace",
      links: [
        {
          label: "Frontline mode",
          description: "Open the live kitchen order queue",
          icon: LayoutDashboard,
          onPress: onEnterFrontline,
        },
      ],
    },
    {
      title: "Account",
      links: [
        {
          label: "Sign out",
          description: accountName,
          icon: LogOut,
          onPress: onSignOut,
          destructive: true,
        },
      ],
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.black[50] }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 14,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.black[900] }}>
          More
        </Text>
      </View>

      <View style={{ padding: 16, gap: 20 }}>
        {sections.map((section) => (
          <View key={section.title}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: theme.colors.black[400],
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
                marginLeft: 4,
              }}
            >
              {section.title}
            </Text>
            <View
              style={{
                backgroundColor: theme.colors.white,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.black[100],
                overflow: "hidden",
              }}
            >
              {section.links.map((link, i) => {
                const Icon = link.icon;
                return (
                <Pressable
                  key={link.label}
                  onPress={link.onPress}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: theme.colors.black[100],
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: link.destructive
                        ? theme.colors.cinnabar[100]
                        : theme.colors.primary[50],
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      size={18}
                      color={
                        link.destructive ? theme.colors.cinnabar[500] : theme.colors.brand
                      }
                      strokeWidth={2.25}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: link.destructive
                          ? theme.colors.cinnabar[500]
                          : theme.colors.black[900],
                      }}
                    >
                      {link.label}
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {link.description}
                    </Text>
                  </View>
                  {link.badge ? (
                    <View
                      style={{
                        backgroundColor: theme.colors.dixie[100],
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{ fontSize: 10, fontWeight: "700", color: theme.colors.dixie[500] }}
                      >
                        {link.badge}
                      </Text>
                    </View>
                  ) : (
                    <ChevronRight size={18} color={theme.colors.black[200]} />
                  )}
                </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
