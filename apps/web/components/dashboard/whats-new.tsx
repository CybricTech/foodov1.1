"use client";

/**
 * "What's New" — branded feature-announcement popup for merchants.
 *
 * A Grubhub-style, on-brand changelog: an unseen entry auto-opens a paged
 * carousel once on the merchant's next home load; the persistent button (with an
 * unread dot) reopens the full list anytime. "Seen" is tracked per USER via
 * user_profiles.last_seen_changelog_at (the user_profiles_own RLS policy lets a
 * user stamp their own row), so each owner/staff member sees it exactly once.
 *
 * Data is fetched server-side (published entries + the user's last-seen time) and
 * passed in, so this component is purely presentation + the mark-seen write.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

export type ChangelogEntry = {
  id: string;
  title: string;
  body: string;
  tag: string;
  image_url: string | null;
  version_label: string | null;
  published_at: string | null;
};

const TAG_STYLES: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-viridian-100 text-viridian-600" },
  improved: { label: "Improved", className: "bg-purple-100 text-purple-600" },
  fixed: { label: "Fixed", className: "bg-dixie-100 text-dixie-600" },
};

export function WhatsNew({
  userId,
  entries,
  lastSeenAt,
}: {
  userId: string;
  entries: ChangelogEntry[];
  lastSeenAt: string | null;
}) {
  const unseen = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.published_at &&
          (!lastSeenAt || new Date(e.published_at) > new Date(lastSeenAt))
      ),
    [entries, lastSeenAt]
  );

  const [open, setOpen] = useState(false);
  // Which set the carousel shows: the unseen entries (auto-popup) or everything
  // (manual open via the button).
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [page, setPage] = useState(0);
  const [hasUnread, setHasUnread] = useState(unseen.length > 0);

  // Auto-open once on mount when there's something the user hasn't seen.
  useEffect(() => {
    if (unseen.length > 0) {
      setMode("auto");
      setPage(0);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (entries.length === 0) return null;

  const shown = mode === "auto" ? unseen : entries;
  const current = shown[Math.min(page, shown.length - 1)];

  async function markSeen() {
    if (!hasUnread) return;
    setHasUnread(false);
    try {
      const supabase = createBrowserClient();
      await supabase
        .from("user_profiles")
        .update({ last_seen_changelog_at: new Date().toISOString() })
        .eq("id", userId);
    } catch {
      // Non-critical — worst case the popup shows again next load.
    }
  }

  function openManual() {
    setMode("manual");
    setPage(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    void markSeen();
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={openManual}
        aria-label="What's new"
        className="relative flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors duration-150 min-h-[36px] cursor-pointer"
      >
        <Sparkles size={14} strokeWidth={2.5} />
        <span className="hidden sm:inline">What&rsquo;s New</span>
        {hasUnread && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cinnabar-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cinnabar-500" />
          </span>
        )}
      </button>

      {open && current && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md md:mx-4 max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-[whatsNewIn_0.4s_cubic-bezier(0.22,1,0.36,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes whatsNewIn {
                from { opacity: 0; transform: translateY(24px) scale(0.98); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes blobA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-12px,-10px) scale(1.08); } }
              @keyframes blobB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(10px,-8px) scale(1.06); } }
            `}</style>

            {/* Branded gradient header */}
            <div
              className="relative px-6 pt-6 pb-7 overflow-hidden"
              style={{ background: "linear-gradient(140deg, #10002B 0%, #3C096C 55%, #7B2CBF 100%)" }}
            >
              <div
                className="absolute -top-10 -right-8 w-44 h-44 rounded-full pointer-events-none"
                style={{ background: "rgba(255,255,255,0.06)", animation: "blobA 8s ease-in-out infinite" }}
              />
              <div
                className="absolute -bottom-12 -left-10 w-48 h-48 rounded-full pointer-events-none"
                style={{ background: "rgba(255,255,255,0.04)", animation: "blobB 10s ease-in-out infinite" }}
              />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={15} className="text-white/80" strokeWidth={2.5} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/70">
                    What&rsquo;s New
                  </span>
                </div>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={18} className="text-white/80" />
                </button>
              </div>
              <p className="relative mt-4 text-2xl font-black text-white tracking-tight">KITCHYN</p>
              {shown.length > 1 && (
                <p className="relative mt-1 text-[11px] text-white/50">
                  {page + 1} of {shown.length}
                </p>
              )}
            </div>

            {/* Entry body */}
            <div className="overflow-y-auto px-6 py-5 flex-1">
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    (TAG_STYLES[current.tag] ?? TAG_STYLES.new).className
                  }`}
                >
                  {(TAG_STYLES[current.tag] ?? TAG_STYLES.new).label}
                </span>
                {current.version_label && (
                  <span className="text-[11px] text-black-400 font-medium">{current.version_label}</span>
                )}
              </div>

              {current.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.image_url}
                  alt=""
                  className="w-full h-40 object-cover rounded-2xl mb-4 border border-black-100"
                />
              )}

              <h3 className="text-lg font-extrabold text-black-900 leading-snug">{current.title}</h3>
              <p className="mt-2 text-sm text-black-500 leading-relaxed whitespace-pre-line">
                {current.body}
              </p>
            </div>

            {/* Footer controls */}
            <div className="px-6 pb-6 pt-1 flex items-center gap-3">
              {shown.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {shown.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      aria-label={`Go to ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                        i === page ? "w-5 bg-purple-500" : "w-1.5 bg-black-200 hover:bg-black-300"
                      }`}
                    />
                  ))}
                </div>
              )}
              <div className="flex-1" />
              {shown.length > 1 && page > 0 && (
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="p-2 rounded-xl border border-black-200 text-black-500 hover:bg-black-50 transition-colors cursor-pointer"
                  aria-label="Previous"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              {page < shown.length - 1 ? (
                <button
                  onClick={() => setPage((p) => Math.min(shown.length - 1, p + 1))}
                  className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={close}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Got it
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
