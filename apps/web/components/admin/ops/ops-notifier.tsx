"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { formatKobo } from "@foodo/utils";
import type { LiveOrderRow } from "@/components/admin/live-ops-client";

const ALERTS_KEY = "live-ops-alerts";

interface NewOrderNotifierProps {
  /**
   * Firing mechanism for the integrator (LiveOpsClient): set this once per
   * realtime INSERT event, right after pushFeed:
   *
   *   setNewOrderSignal({ order: row, merchantName });
   *
   * where `row` is the LiveOrderRow from payload.new and merchantName is
   * resolved from merchantsRef (the INSERT handler already has both).
   * The notifier beeps + raises a browser Notification when alerts are on;
   * the lastNotifiedIdRef guard means the same order id never fires twice.
   */
  newOrderSignal: { order: LiveOrderRow; merchantName: string } | null;
}

/**
 * Header bell control — opt-in sound + browser notifications for new orders
 * (docs/live-ops-v2-ux.md §8).
 *
 * Rules baked in here, not in the integrator:
 *  • opt-in persists under localStorage key "live-ops-alerts"
 *  • Notification permission is requested ONLY inside the toggle-on click
 *    handler — never on load/mount
 *  • alerts enable regardless of the permission result (denied ⇒ sound-only)
 *  • the sound is a synthesized AudioContext beep — no audio asset
 */
export function NewOrderNotifier({ newOrderSignal }: NewOrderNotifierProps) {
  const [alertsOn, setAlertsOn] = useState(false);
  const [statusText, setStatusText] = useState("");
  const audioRef = useRef<AudioContext | null>(null);
  const alertsOnRef = useRef(false);
  const lastNotifiedIdRef = useRef<string | null>(null);

  // Mirrors what state will become — read inside the signal effect so it sees
  // the alertsOn value at the moment the signal ARRIVES, not at render time.
  alertsOnRef.current = alertsOn;

  // Restore the persisted opt-in only after mount so server and client renders
  // agree (no hydration mismatch). Reading localStorage, not requesting.
  useEffect(() => {
    try {
      setAlertsOn(
        typeof window !== "undefined" &&
          window.localStorage.getItem(ALERTS_KEY) === "on"
      );
    } catch {
      // Storage unavailable (private mode) — stay off, keep the UI usable.
    }
  }, []);

  // Fires on every newOrderSignal change. The id guard runs BEFORE the
  // alertsOn check, so a signal that arrived while alerts were off can never
  // be replayed as a fresh order when the user toggles on later — and a
  // duplicate INSERT (post-reconnect) never double-fires.
  useEffect(() => {
    if (!newOrderSignal) return;
    const { order, merchantName } = newOrderSignal;
    if (lastNotifiedIdRef.current === order.id) return;
    lastNotifiedIdRef.current = order.id;
    if (!alertsOnRef.current) return;

    playBeep();

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(`New order #${order.order_number}`, {
          body: `${merchantName} — ${formatKobo(order.total_kobo)}`,
        });
      } catch {
        // Some engines throw when notifications are construction-blocked.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playBeep is a
    // stable module-internal function; only the signal drives this effect.
  }, [newOrderSignal]);

  // The ONLY path that may request permission: the user's explicit toggle-on
  // click. Enabling succeeds regardless of the result (denied ⇒ sound-only
  // mode; the beep still works because the click gesture starts AudioContext).
  async function handleToggle() {
    if (alertsOn) {
      setAlertsOn(false);
      setStatusText("New order alerts disabled");
      try {
        window.localStorage.setItem(ALERTS_KEY, "off");
      } catch {
        // ignore storage failures
      }
      return;
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      try {
        await Notification.requestPermission();
      } catch {
        // Permission prompt unavailable — fall through to sound-only mode.
      }
    }
    setAlertsOn(true);
    setStatusText("New order alerts enabled");
    try {
      window.localStorage.setItem(ALERTS_KEY, "on");
    } catch {
      // ignore storage failures
    }
  }

  // Proven pattern copied from order-queue-client.tsx playNewOrderSound():
  // 880 → 1100 → 880 Hz oscillator, ~0.5 s, gain 0.3, silent on failure.
  function playBeep() {
    try {
      const ctx =
        audioRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      audioRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio permission not granted — silently fail.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={alertsOn}
        aria-label={alertsOn ? "New order alerts on" : "Alert me on new orders"}
        title={alertsOn ? "New order alerts on" : "Alert me on new orders"}
        className="relative h-10 w-10 rounded-full border border-black-200 bg-white flex items-center justify-center hover:bg-black-50 transition-colors"
      >
        {alertsOn ? (
          <BellRing className="h-4 w-4 text-purple-600" />
        ) : (
          <Bell className="h-4 w-4 text-black-500" />
        )}
        {alertsOn && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-purple-500 ring-2 ring-white" />
        )}
      </button>
      {/* Visually hidden status announcements for screen readers */}
      <span className="sr-only" role="status" aria-live="polite">
        {statusText}
      </span>
    </>
  );
}