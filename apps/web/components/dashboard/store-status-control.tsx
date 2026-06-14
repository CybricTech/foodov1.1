"use client";

/**
 * Store open/close control for the dashboard home header.
 *
 * A dropdown the owner can use to flip the store open/closed in one place,
 * and — when closing — pick a closure message: tappable built-in suggestions
 * plus their own recently-used messages (so they rarely type from scratch).
 *
 * Writes go through the merchant Supabase client under the
 * restaurants_merchant_update RLS policy (own restaurant only). The recent
 * list is kept newest-first and capped on restaurants.closure_message_history.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Power, Clock } from "lucide-react";
import { cn } from "@foodo/ui";
import { createBrowserClient } from "@/lib/supabase/client";

const SUGGESTIONS = [
  "We're taking a short break — back soon!",
  "Closed for today — see you tomorrow!",
  "Fully booked right now, back in about an hour.",
  "Kitchen's on a quick break, back shortly.",
  "Closed for a public holiday. Thanks for your patience!",
];

const MAX_HISTORY = 6;

export function StoreStatusControl({
  restaurantId,
  initialClosureMessage,
  initialHistory,
  acceptsOrders,
  onAcceptsOrdersChange,
}: {
  restaurantId: string;
  initialClosureMessage: string | null;
  initialHistory: string[];
  /** Controlled value so it stays in sync with the page's realtime updates. */
  acceptsOrders: boolean;
  onAcceptsOrdersChange: (next: boolean) => void;
}) {
  const supabase = createBrowserClient();
  const ref = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(initialClosureMessage ?? "");
  const [history, setHistory] = useState<string[]>(initialHistory ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Keep the editable message aligned with the latest known closure message.
  useEffect(() => {
    setMessage(initialClosureMessage ?? "");
  }, [initialClosureMessage]);

  async function persist(nextOpen: boolean, closureMessage: string) {
    setSaving(true);
    setError("");
    const trimmed = closureMessage.trim();
    // When closing with a message, remember it (newest-first, deduped, capped).
    const nextHistory =
      !nextOpen && trimmed
        ? [trimmed, ...history.filter((m) => m !== trimmed)].slice(0, MAX_HISTORY)
        : history;

    const { error: e } = await supabase
      .from("restaurants")
      .update({
        accepts_orders: nextOpen,
        closure_message: trimmed || null,
        closure_message_history: nextHistory,
      })
      .eq("id", restaurantId);

    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setHistory(nextHistory);
    onAcceptsOrdersChange(nextOpen);
    if (nextOpen) setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage store status"
        className={cn(
          "flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl min-h-[36px] transition-colors cursor-pointer",
          acceptsOrders
            ? "bg-viridian-50 text-viridian-700 hover:bg-viridian-100"
            : "bg-cinnabar-50 text-cinnabar-600 hover:bg-cinnabar-100"
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            acceptsOrders ? "bg-viridian-500 animate-pulse" : "bg-cinnabar-500"
          )}
        />
        {acceptsOrders ? "Open" : "Closed"}
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={cn("transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white border border-black-100 rounded-2xl shadow-xl overflow-hidden">
          {/* Current state + primary action */}
          <div className="p-4 border-b border-black-50">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                  acceptsOrders ? "bg-viridian-50" : "bg-cinnabar-50"
                )}
              >
                <Power
                  size={16}
                  strokeWidth={2.5}
                  className={acceptsOrders ? "text-viridian-600" : "text-cinnabar-500"}
                />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-black-900">
                  Store is {acceptsOrders ? "open" : "closed"}
                </p>
                <p className="text-xs text-black-400">
                  {acceptsOrders ? "Accepting orders now" : "Customers can't order right now"}
                </p>
              </div>
            </div>

            {acceptsOrders ? (
              <button
                onClick={() => persist(false, message)}
                disabled={saving}
                className="mt-3 w-full bg-cinnabar-500 hover:bg-cinnabar-500/90 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {saving ? "Closing…" : "Close store"}
              </button>
            ) : (
              <button
                onClick={() => persist(true, "")}
                disabled={saving}
                className="mt-3 w-full bg-viridian-500 hover:bg-viridian-500/90 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {saving ? "Opening…" : "Open store"}
              </button>
            )}
          </div>

          {/* Closure message picker — relevant when closing/closed */}
          <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
            <div>
              <p className="text-[11px] font-bold text-black-400 uppercase tracking-wide mb-1.5">
                Closure message
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Shown to customers while you're closed (optional)"
                className="w-full px-3 py-2 text-sm border border-black-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 resize-none"
              />
            </div>

            {history.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-black-400 flex items-center gap-1 mb-1.5">
                  <Clock size={11} /> Recently used
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((m) => (
                    <MessageChip key={m} text={m} active={message.trim() === m} onClick={() => setMessage(m)} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-black-400 mb-1.5">Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((m) => (
                  <MessageChip key={m} text={m} active={message.trim() === m} onClick={() => setMessage(m)} />
                ))}
              </div>
            </div>

            {!acceptsOrders && (
              <button
                onClick={() => persist(false, message)}
                disabled={saving}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                {saving ? "Saving…" : "Save message"}
              </button>
            )}

            {error && <p className="text-xs text-cinnabar-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageChip({
  text,
  active,
  onClick,
}: {
  text: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 max-w-full",
        active
          ? "border-purple-300 bg-purple-50 text-purple-700"
          : "border-black-200 text-black-600 hover:bg-black-50"
      )}
    >
      {active && <Check size={12} className="flex-shrink-0" />}
      <span className="truncate">{text}</span>
    </button>
  );
}
