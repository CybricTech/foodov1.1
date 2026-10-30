/**
 * Kitchyn Wrapped — mobile owner-app entry point (pill + one-time auto-open).
 *
 * RN sibling of the web KitchynWrapped and modelled on ../whats-new.tsx: the
 * latest published edition auto-opens once per user, and the header pill (with
 * an unread dot) replays it anytime. "Seen" is user_profiles.last_seen_wrapped_key,
 * shared with the web dashboard, so watching on one surface clears the other.
 * Self-fetching, given the user and restaurant ids.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gift } from "lucide-react-native";
import { isWrappedUnseen, type WrappedEdition } from "@foodo/utils";

import { getSupabase } from "../../../lib/supabase";
import { theme } from "../../../theme";
import { WrappedStory } from "./wrapped-story";

export function KitchynWrapped({
  userId,
  restaurantId,
  onBusyChange,
}: {
  userId: string;
  restaurantId: string;
  /**
   * true while Wrapped may still auto-open or is on screen; false once it's
   * done. Lets "What's New" hold its own popup so the two never stack.
   */
  onBusyChange?: (busy: boolean) => void;
}) {
  const supabase = getSupabase();
  const [edition, setEdition] = useState<WrappedEdition | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) {
        onBusyChange?.(false);
        return;
      }
      const [{ data: row }, { data: profile }] = await Promise.all([
        supabase
          .from("merchant_wrapped")
          .select("period_key, scope, stats")
          .eq("restaurant_id", restaurantId)
          .not("published_at", "is", null)
          .order("period_key", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("user_profiles").select("last_seen_wrapped_key").eq("id", userId).maybeSingle(),
      ]);
      if (!active) return;
      if (!row) {
        onBusyChange?.(false);
        return;
      }
      const latest = row as unknown as WrappedEdition;
      const seenKey = (profile as { last_seen_wrapped_key?: string | null } | null)?.last_seen_wrapped_key ?? null;
      setEdition(latest);
      if (isWrappedUnseen(latest, seenKey)) {
        setHasUnread(true);
        setTimeout(() => {
          if (!active) return;
          setOpen(true);
          void markSeen(latest.period_key);
        }, 900);
      } else {
        onBusyChange?.(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId, restaurantId]);

  async function markSeen(periodKey: string) {
    setHasUnread(false);
    try {
      await supabase?.from("user_profiles").update({ last_seen_wrapped_key: periodKey }).eq("id", userId);
    } catch {
      // non-critical
    }
  }

  if (!edition) return null;

  return (
    <>
      <Pressable
        onPress={() => {
          setOpen(true);
          if (hasUnread) void markSeen(edition.period_key);
        }}
        accessibilityLabel="Your Kitchyn Wrapped"
        style={{ borderRadius: 12, overflow: "visible" }}
      >
        <LinearGradient
          colors={["#10002B", "#5A189A", "#E63946"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}
        >
          <Gift size={15} color="#fff" strokeWidth={2.5} />
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Wrapped</Text>
        </LinearGradient>
        {hasUnread ? (
          <View
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: theme.colors.gold,
              borderWidth: 2,
              borderColor: "#fff",
            }}
          />
        ) : null}
      </Pressable>
      <WrappedStory
        edition={edition}
        visible={open}
        onClose={() => {
          setOpen(false);
          onBusyChange?.(false);
        }}
      />
    </>
  );
}
