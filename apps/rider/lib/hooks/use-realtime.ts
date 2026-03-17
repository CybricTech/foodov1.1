import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../supabase";
import { useDeliveryStore } from "../stores/delivery";

export function useRealtimeAssignments(riderId: string | undefined) {
  const handleAssignmentChange = useDeliveryStore(
    (s) => s.handleAssignmentChange
  );

  useEffect(() => {
    if (!riderId) return;

    const channel = supabase
      .channel(`rider-assignments-${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_assignments",
          filter: `rider_id=eq.${riderId}`,
        },
        (payload) => {
          handleAssignmentChange(payload as any);
        }
      )
      .subscribe();

    // Reconnect on app foreground
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          supabase.realtime.connect();
        } else {
          supabase.realtime.disconnect();
        }
      }
    );

    return () => {
      supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [riderId, handleAssignmentChange]);
}
