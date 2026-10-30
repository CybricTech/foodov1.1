"use client";

/**
 * Kitchyn Wrapped — the full-screen story player.
 *
 * Story controls, the way people already know them from Spotify/Instagram:
 *   • tap the right side (or →, Space) for the next card, left side (←) to go back
 *   • press and hold anywhere to pause; let go to carry on
 *   • swipe down, Esc or ✕ to close
 * Cards auto-advance on their own timer; the last card (the summary) stays.
 *
 * Forward transitions are a circular reveal that grows from where you tapped,
 * while the outgoing card sinks back — so every tap feels physical.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import posthog from "posthog-js";
import { buildWrappedSlides, wrappedPeriodLabel, type WrappedEdition } from "@foodo/utils";
import { SLIDE_META, WrappedPausedContext, WrappedSlideView } from "./slides";
import { shareSummaryCard } from "./share-card";
import "./wrapped.css";

const HOLD_MS = 180;
const EXIT_MS = 850;

type Transition = { from: number | null; dir: "fwd" | "back"; ox: string; oy: string };

export function WrappedStory({ edition, onClose }: { edition: WrappedEdition; onClose: () => void }) {
  const slides = useMemo(() => buildWrappedSlides(edition.stats), [edition]);
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0); // bumps on replay so every card remounts
  const [transition, setTransition] = useState<Transition>({ from: null, dir: "fwd", ox: "50%", oy: "50%" });
  const [heldPause, setHeldPause] = useState(false);
  const [userPause, setUserPause] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const paused = heldPause || userPause || hidden || closing;
  const slide = slides[index];
  const meta = SLIDE_META[slide.kind];
  const isLast = index === slides.length - 1;

  const barRefs = useRef<(HTMLElement | null)[]>([]);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // ── Navigation ──────────────────────────────────────────────────────────

  const go = useCallback(
    (next: number, origin?: { x: number; y: number }) => {
      if (next < 0 || next >= slides.length || next === index) return;
      elapsedRef.current = 0;
      setTransition({
        from: index,
        dir: next > index ? "fwd" : "back",
        ox: origin ? `${origin.x}%` : "85%",
        oy: origin ? `${origin.y}%` : "55%",
      });
      setIndex(next);
    },
    [index, slides.length]
  );

  const next = useCallback((o?: { x: number; y: number }) => go(index + 1, o), [go, index]);
  const prev = useCallback(() => {
    if (index === 0) {
      elapsedRef.current = 0; // restart the first card
      setRun((r) => r + 1);
      return;
    }
    go(index - 1);
  }, [go, index]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 320);
  }, [onClose]);

  const replay = useCallback(() => {
    elapsedRef.current = 0;
    setTransition({ from: index, dir: "fwd", ox: "50%", oy: "50%" });
    setIndex(0);
    setRun((r) => r + 1);
    posthog.capture?.("wrapped_replayed", { period_key: edition.period_key });
  }, [index, edition.period_key]);

  // Drop the outgoing card once its exit animation has played.
  useEffect(() => {
    if (transition.from === null) return;
    const t = setTimeout(() => setTransition((tr) => ({ ...tr, from: null })), EXIT_MS);
    return () => clearTimeout(t);
  }, [transition.from, index]);

  // ── Progress timer (rAF, pause-aware) ───────────────────────────────────

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const duration = meta.duration;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current && duration > 0) elapsedRef.current += dt;
      const p = duration > 0 ? Math.min(1, elapsedRef.current / duration) : 1;
      barRefs.current.forEach((el, i) => {
        if (el) el.style.width = `${i < index ? 100 : i === index ? p * 100 : 0}%`;
      });
      if (duration > 0 && p >= 1) {
        if (index < slides.length - 1) {
          go(index + 1);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, run, meta.duration, slides.length, go]);

  // ── Lifecycle: analytics, scroll lock, keys, tab visibility ─────────────

  useEffect(() => {
    posthog.capture?.("wrapped_opened", { period_key: edition.period_key, scope: edition.scope, cards: slides.length });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLast) posthog.capture?.("wrapped_completed", { period_key: edition.period_key });
  }, [isLast, edition.period_key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        if (isLast) return;
        next();
      }
    };
    const onVis = () => setHidden(document.visibilityState === "hidden");
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [close, next, prev, isLast]);

  // ── Pointer: tap zones, hold-to-pause, swipe-down-to-close ──────────────

  const pointer = useRef<{ x: number; y: number; t: number; timer: ReturnType<typeof setTimeout> | null; held: boolean } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const p = { x: e.clientX, y: e.clientY, t: Date.now(), timer: null as ReturnType<typeof setTimeout> | null, held: false };
    p.timer = setTimeout(() => {
      p.held = true;
      setHeldPause(true);
    }, HOLD_MS);
    pointer.current = p;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    setHeldPause(false);

    const dy = e.clientY - p.y;
    const dx = e.clientX - p.x;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return close();
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev();
    if (p.held) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    if (rx < 0.3) prev();
    else next({ x: Math.round(rx * 100), y: Math.round(ry * 100) });
  }

  function onPointerCancel() {
    if (pointer.current?.timer) clearTimeout(pointer.current.timer);
    pointer.current = null;
    setHeldPause(false);
  }

  async function onShare() {
    const summary = slides[slides.length - 1];
    if (summary.kind !== "summary") return;
    setSharing(true);
    const result = await shareSummaryCard(summary);
    setSharing(false);
    posthog.capture?.("wrapped_shared", { period_key: edition.period_key, result });
  }

  const label = edition.scope === "all_time" ? "All-time Wrapped" : `${wrappedPeriodLabel(edition.period_key)} Wrapped`;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <WrappedPausedContext.Provider value={paused}>
      <div className={`kw-root ${closing ? "kw-closing" : ""}`} role="dialog" aria-modal="true" aria-label={`Kitchyn ${label}`}>
        <button type="button" className="kw-nav" onClick={prev} disabled={index === 0} aria-label="Previous card">
          <ChevronLeft size={22} />
        </button>

        <div
          className={`kw-stage ${paused ? "kw-paused" : ""} ${meta.light ? "kw-on-light" : ""}`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* The outgoing card keeps its key (and DOM), so it sinks away exactly
              as it looked instead of restarting its animations. */}
          {(transition.from !== null ? [transition.from, index] : [index]).map((i) => {
            const leaving = i !== index;
            const enter = transition.from !== null ? (transition.dir === "fwd" ? "kw-enter-fwd" : "kw-enter-back") : "";
            return (
              <div
                key={`${run}-${i}`}
                className={`kw-slide ${leaving ? "kw-exit" : enter}`}
                style={leaving ? undefined : { ["--ox" as string]: transition.ox, ["--oy" as string]: transition.oy }}
                aria-hidden={leaving || undefined}
                aria-live={leaving ? undefined : "polite"}
              >
                <WrappedSlideView slide={slides[i]} onShare={onShare} onReplay={replay} sharing={sharing} />
              </div>
            );
          })}

          <div className="kw-chrome" style={{ color: meta.light ? "var(--kw-ink)" : "#fff" }}>
            <div className="kw-bars">
              {slides.map((_, i) => (
                <div key={i} className="kw-bar">
                  <i ref={(el) => { barRefs.current[i] = el; }} />
                </div>
              ))}
            </div>
            <div className="kw-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Kitchyn" className="kw-logo" />
              <span className="kw-head-label">{label}</span>
              <span style={{ flex: 1 }} />
              {!isLast && (
                <button
                  type="button"
                  className="kw-icon-btn"
                  onPointerDown={stop}
                  onPointerUp={stop}
                  onClick={() => setUserPause((p) => !p)}
                  aria-label={userPause ? "Play" : "Pause"}
                >
                  {userPause ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
                </button>
              )}
              <button type="button" className="kw-icon-btn" onPointerDown={stop} onPointerUp={stop} onClick={close} aria-label="Close">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        <button type="button" className="kw-nav" onClick={() => next()} disabled={isLast} aria-label="Next card">
          <ChevronRight size={22} />
        </button>
      </div>
    </WrappedPausedContext.Provider>
  );
}
