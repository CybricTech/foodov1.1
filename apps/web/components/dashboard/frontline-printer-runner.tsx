"use client";

// Headless engine driver for the frontline receipt printer. Mounted once in the
// FrontlineShell so it runs on EVERY frontline page (orders, menu, …) — new
// orders print the instant they land, regardless of what the staff is looking at.
//
// Reliability: besides the realtime INSERT stream, it does a catch-up fetch on
// mount, whenever connectivity is restored, and on a slow interval — so orders
// that arrived while the device was offline (or realtime dropped an event) get
// queued and printed. The engine itself dedupes by order id, so catch-up can
// never reprint.

import { useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useConnection } from "@/lib/connection-context";
import { printEngine } from "@/lib/printing/use-printer";
import { toReceiptOrder, NEW_STAGE_STATUSES } from "@/lib/printing/map-order";

const ORDER_SELECT =
  "*, order_items (id, item_name, quantity, line_total_kobo, selected_options)";
// Don't print ancient backlog on first setup — only orders from the recent past.
const CATCH_UP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h
const CATCH_UP_INTERVAL_MS = 60_000;

export function FrontlinePrinterRunner({
  restaurantId,
  restaurantName,
  logoUrl,
}: {
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
}) {
  const { reportRealtimeStatus, onReconnect } = useConnection();

  useEffect(() => {
    printEngine.configure({ restaurantId, restaurantName, logoUrl });
  }, [restaurantId, restaurantName, logoUrl]);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function catchUp() {
      const since = new Date(Date.now() - CATCH_UP_WINDOW_MS).toISOString();
      const { data } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("restaurant_id", restaurantId)
        .in("status", NEW_STAGE_STATUSES)
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      for (const row of data ?? []) printEngine.enqueue(toReceiptOrder(row));
    }

    const channel = supabase
      .channel(`printer-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).single();
          if (data && NEW_STAGE_STATUSES.includes((data as { status: string }).status)) {
            printEngine.enqueue(toReceiptOrder(data));
          }
        }
      )
      .subscribe((status) => {
        reportRealtimeStatus(status === "SUBSCRIBED");
      });

    // Initial catch-up + safety-net interval + reconnect catch-up.
    void catchUp();
    const interval = setInterval(() => void catchUp(), CATCH_UP_INTERVAL_MS);
    const offReconnect = onReconnect(catchUp);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
      offReconnect();
    };
  }, [restaurantId, reportRealtimeStatus, onReconnect]);

  return null;
}
