"use client";

/**
 * Kitchyn Wrapped — dashboard entry point (pill + one-time auto-open).
 *
 * Mirrors "What's New": when a new edition is published (last day of each
 * month, see migration 20261030120000_merchant_wrapped.sql) it auto-opens once
 * on the merchant's next dashboard load, and the pill (with an unread dot)
 * replays it anytime. "Seen" is per user via user_profiles.last_seen_wrapped_key
 * (the user_profiles_own RLS policy lets a user stamp their own row).
 *
 * The edition is fetched server-side and passed in, so this is presentation
 * plus the mark-seen write. The story player is code-split: it only downloads
 * when a merchant actually opens it.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Gift } from "lucide-react";
import { isWrappedUnseen, type WrappedEdition } from "@foodo/utils";
import { createBrowserClient } from "@/lib/supabase/client";
import "./wrapped.css";

const SEEN_EVENT = "kitchyn-wrapped-seen";

const WrappedStory = dynamic(() => import("./wrapped-story").then((m) => m.WrappedStory), { ssr: false });

export function KitchynWrapped({
  userId,
  edition,
  lastSeenKey,
  autoOpen = true,
  showButton = true,
}: {
  userId: string;
  edition: WrappedEdition | null;
  lastSeenKey: string | null;
  /** Auto-open once when there's an unseen edition. */
  autoOpen?: boolean;
  /** Render the "Your Wrapped" pill. */
  showButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(isWrappedUnseen(edition, lastSeenKey));

  // Both instances (layout auto-opener + home pill) drop the dot together.
  useEffect(() => {
    const onSeen = () => setHasUnread(false);
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SEEN_EVENT, onSeen);
  }, []);

  useEffect(() => {
    if (!autoOpen || !hasUnread) return;
    // Warm the chunk, then ease in after a beat rather than slamming up on load.
    void import("./wrapped-story");
    const t = setTimeout(() => {
      setOpen(true);
      void markSeen();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!edition) return null;

  async function markSeen() {
    if (!edition) return;
    setHasUnread(false);
    window.dispatchEvent(new Event(SEEN_EVENT));
    try {
      const supabase = createBrowserClient();
      await supabase
        .from("user_profiles")
        .update({ last_seen_wrapped_key: edition.period_key })
        .eq("id", userId);
    } catch {
      // Non-critical — worst case it auto-opens once more.
    }
  }

  function openStory() {
    setOpen(true);
    void markSeen();
  }

  return (
    <>
      {showButton && (
        <button
          onClick={openStory}
          onMouseEnter={() => void import("./wrapped-story")}
          aria-label="Your Kitchyn Wrapped"
          className="relative isolate flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl text-white min-h-[36px] cursor-pointer shadow-sm hover:shadow-md transition-shadow"
        >
          <span aria-hidden className="kw-pill absolute inset-0 -z-10 rounded-xl" />
          <Gift size={14} strokeWidth={2.5} />
          <span className="hidden sm:inline">Your Wrapped</span>
          {hasUnread && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gold ring-2 ring-white" />
            </span>
          )}
        </button>
      )}
      {open && <WrappedStory edition={edition} onClose={() => setOpen(false)} />}
    </>
  );
}
