/**
 * "What's New" — branded feature-announcement sheet for the mobile owner app.
 *
 * RN sibling of the web `WhatsNew`: an unseen entry auto-opens a paged carousel
 * once on home load; the header button (with an unread dot) reopens the full
 * list anytime. "Seen" is per-user via user_profiles.last_seen_changelog_at
 * (RLS lets a user stamp their own row). Self-fetching, given the user id.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react-native";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";

type Entry = {
  id: string;
  title: string;
  body: string;
  tag: string;
  image_url: string | null;
  version_label: string | null;
  published_at: string | null;
};

const TAG_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  new: { label: "New", bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  improved: { label: "Improved", bg: theme.colors.primary[50], fg: theme.colors.brand },
  fixed: { label: "Fixed", bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
};

export function WhatsNew({ userId }: { userId: string }) {
  const supabase = getSupabase();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [page, setPage] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);

  const unseen = useMemo(
    () =>
      entries.filter(
        (e) => e.published_at && (!lastSeenAt || new Date(e.published_at) > new Date(lastSeenAt))
      ),
    [entries, lastSeenAt]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) return;
      const [{ data: rows }, { data: profile }] = await Promise.all([
        supabase
          .from("changelog_entries")
          .select("id, title, body, tag, image_url, version_label, published_at")
          .not("published_at", "is", null)
          .lte("published_at", new Date().toISOString())
          .order("published_at", { ascending: false })
          .limit(20),
        supabase.from("user_profiles").select("last_seen_changelog_at").eq("id", userId).maybeSingle(),
      ]);
      if (!active) return;
      const list = (rows as unknown as Entry[]) ?? [];
      const seen =
        (profile as { last_seen_changelog_at?: string | null } | null)?.last_seen_changelog_at ?? null;
      setEntries(list);
      setLastSeenAt(seen);
      const freshUnseen = list.filter(
        (e) => e.published_at && (!seen || new Date(e.published_at) > new Date(seen))
      );
      if (freshUnseen.length > 0) {
        setHasUnread(true);
        setMode("auto");
        setPage(0);
        setOpen(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, userId]);

  const markSeen = useCallback(async () => {
    if (!hasUnread) return;
    setHasUnread(false);
    try {
      if (!supabase) return;
      await supabase
        .from("user_profiles")
        .update({ last_seen_changelog_at: new Date().toISOString() })
        .eq("id", userId);
    } catch {
      // non-critical
    }
  }, [hasUnread, supabase, userId]);

  function close() {
    setOpen(false);
    void markSeen();
  }

  if (entries.length === 0) return null;

  const shown = mode === "auto" ? unseen : entries;
  const current = shown[Math.min(page, Math.max(0, shown.length - 1))];

  return (
    <>
      <Pressable
        onPress={() => {
          setMode("manual");
          setPage(0);
          setOpen(true);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: theme.colors.primary[50],
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 9,
        }}
      >
        <Sparkles size={15} color={theme.colors.brand} strokeWidth={2.5} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.brand }}>New</Text>
        {hasUnread ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.colors.cinnabar[500],
            }}
          />
        ) : null}
      </Pressable>

      <Modal visible={open && !!current} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          onPress={close}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: theme.colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: "hidden",
              maxHeight: "88%",
            }}
          >
            {current ? (
              <>
                {/* Branded gradient header */}
                <LinearGradient
                  colors={["#10002B", "#3C096C", "#7B2CBF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 24 }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Sparkles size={14} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          letterSpacing: 1.5,
                          color: "rgba(255,255,255,0.7)",
                        }}
                      >
                        WHAT&rsquo;S NEW
                      </Text>
                    </View>
                    <Pressable onPress={close} hitSlop={10}>
                      <X size={20} color="rgba(255,255,255,0.8)" />
                    </Pressable>
                  </View>
                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: "900",
                      color: "#fff",
                      marginTop: 14,
                      letterSpacing: -0.5,
                    }}
                  >
                    KITCHYN
                  </Text>
                  {shown.length > 1 ? (
                    <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                      {page + 1} of {shown.length}
                    </Text>
                  ) : null}
                </LinearGradient>

                {/* Body */}
                <ScrollView contentContainerStyle={{ padding: 24 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <View
                      style={{
                        backgroundColor: (TAG_STYLES[current.tag] ?? TAG_STYLES.new).bg,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: (TAG_STYLES[current.tag] ?? TAG_STYLES.new).fg,
                        }}
                      >
                        {(TAG_STYLES[current.tag] ?? TAG_STYLES.new).label}
                      </Text>
                    </View>
                    {current.version_label ? (
                      <Text style={{ fontSize: 11, color: theme.colors.black[400], fontWeight: "500" }}>
                        {current.version_label}
                      </Text>
                    ) : null}
                  </View>

                  {current.image_url ? (
                    <Image
                      source={{ uri: current.image_url }}
                      style={{
                        width: "100%",
                        height: 160,
                        borderRadius: 16,
                        marginBottom: 16,
                        backgroundColor: theme.colors.black[100],
                      }}
                      resizeMode="cover"
                    />
                  ) : null}

                  <Text style={{ fontSize: 19, fontWeight: "800", color: theme.colors.black[900] }}>
                    {current.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.colors.black[500],
                      lineHeight: 21,
                      marginTop: 8,
                    }}
                  >
                    {current.body}
                  </Text>
                </ScrollView>

                {/* Footer controls */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 24,
                    paddingBottom: 28,
                    paddingTop: 4,
                  }}
                >
                  {shown.length > 1 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {shown.map((_, i) => (
                        <View
                          key={i}
                          style={{
                            height: 6,
                            width: i === page ? 20 : 6,
                            borderRadius: 999,
                            backgroundColor: i === page ? theme.colors.brand : theme.colors.black[200],
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {shown.length > 1 && page > 0 ? (
                    <Pressable
                      onPress={() => setPage((p) => Math.max(0, p - 1))}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.black[200],
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronLeft size={18} color={theme.colors.black[500]} />
                    </Pressable>
                  ) : null}
                  {page < shown.length - 1 ? (
                    <Pressable
                      onPress={() => setPage((p) => Math.min(shown.length - 1, p + 1))}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor: theme.colors.brand,
                        paddingHorizontal: 20,
                        paddingVertical: 13,
                        borderRadius: 12,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Next</Text>
                      <ChevronRight size={16} color="#fff" />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={close}
                      style={{
                        backgroundColor: theme.colors.brand,
                        paddingHorizontal: 26,
                        paddingVertical: 13,
                        borderRadius: 12,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Got it</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
