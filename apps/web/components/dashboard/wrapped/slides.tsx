"use client";

/**
 * Kitchyn Wrapped — one renderer per slide kind.
 *
 * Which slides exist and what they say comes from buildWrappedSlides() in
 * @foodo/utils (shared with the mobile app); this file only decides how each
 * one looks and moves. All motion is CSS (wrapped.css) keyed off mount, plus a
 * pause-aware count-up for the big numbers.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bike, Crown, Download, Quote, RotateCcw, ShoppingBag, Star } from "lucide-react";
import {
  wrappedNaira,
  type WrappedSlide,
  type WrappedSlideKind,
} from "@foodo/utils";

/** True while the viewer is holding to pause — count-ups freeze with the CSS. */
export const WrappedPausedContext = createContext(false);

type Meta = { duration: number; light: boolean };

/** How long each card stays up, and whether its background is light. */
export const SLIDE_META: Record<WrappedSlideKind, Meta> = {
  intro: { duration: 6500, light: false },
  origin: { duration: 7500, light: true },
  orders: { duration: 7000, light: false },
  revenue: { duration: 7000, light: false },
  topDish: { duration: 9000, light: true },
  topFive: { duration: 8000, light: true },
  customers: { duration: 7500, light: false },
  fan: { duration: 7500, light: false },
  peak: { duration: 7500, light: false },
  bestDay: { duration: 7000, light: true },
  reviews: { duration: 8500, light: false },
  rank: { duration: 7500, light: false },
  fulfilment: { duration: 7000, light: false },
  summary: { duration: 0, light: false }, // 0 = stays until the viewer leaves
};

const css = (v: Record<string, string | number>) => v as CSSProperties;

// ── Helpers ────────────────────────────────────────────────────────────────

function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Animated number that freezes while the story is paused. */
function useCountUp(target: number, { duration = 1800, delay = 0, decimals = 0 } = {}) {
  const paused = useContext(WrappedPausedContext);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    let elapsed = -delay;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current) elapsed += dt;
      const t = Math.max(0, Math.min(1, elapsed / duration));
      const f = Math.pow(10, decimals);
      setValue(Math.round(target * easeOutExpo(t) * f) / f);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, decimals]);

  return value;
}

function Count({ value, delay, duration, format }: { value: number; delay?: number; duration?: number; format?: (n: number) => string }) {
  const n = useCountUp(value, { delay, duration });
  return <>{format ? format(n) : n.toLocaleString("en-NG")}</>;
}

/** Font size for a big number so long values still fit one line. */
function fitSize(text: string, max: number, budget = 100) {
  return `${Math.min(max, budget / Math.max(1, text.length * 0.62))}cqw`;
}

function Line({ children, d = 0, className = "" }: { children: ReactNode; d?: number; className?: string }) {
  return (
    <span className={`kw-line ${className}`}>
      <span style={css({ "--d": `${d}s` })}>{children}</span>
    </span>
  );
}

/** Deterministic pseudo-random so a slide looks the same every replay. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const CONFETTI_COLORS = ["#FFC629", "#E63946", "#C77DFF", "#FFFFFF", "#F4A261", "#E0AAFF"];

function Confetti({ count = 70, delay = 0, seed = 7 }: { count?: number; delay?: number; seed?: number }) {
  const pieces = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, (_, i) => ({
      x: `${r() * 100}%`,
      w: `${1.6 + r() * 2.2}cqw`,
      c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      t: `${2.4 + r() * 2.2}s`,
      d: `${delay + r() * 0.9}s`,
      dx: `${(r() - 0.5) * 40}cqw`,
      rot: `${(r() - 0.5) * 1440}deg`,
    }));
  }, [count, delay, seed]);
  return (
    <div className="kw-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={css({ "--x": p.x, "--w": p.w, "--c": p.c, "--t": p.t, "--d": p.d, "--dx": p.dx, "--r": p.rot })} />
      ))}
    </div>
  );
}

function Delta({ pct, label, light = false, d = 2 }: { pct: number | null; label: string | null; light?: boolean; d?: number }) {
  if (pct === null || !label) return null;
  const up = pct >= 0;
  return (
    <span
      className="kw-chip kw-pop"
      style={css({
        "--d": `${d}s`,
        background: up ? "#B8F2D0" : light ? "rgba(16,0,43,0.08)" : "rgba(255,255,255,0.14)",
        color: up ? "#0B5A35" : "inherit",
      })}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}% {label}
    </span>
  );
}

// ── Slides ─────────────────────────────────────────────────────────────────

function Intro({ s }: { s: Extract<WrappedSlide, { kind: "intro" }> }) {
  const letters = s.title.split("");
  const allTime = s.eyebrow.toLowerCase().includes("so far");
  const tape = `${s.restaurantName} ✦ Kitchyn Wrapped ✦ `;
  return (
    <div className="kw-slide-inner" style={{ position: "absolute", inset: 0, background: "var(--kw-ink)" }}>
      <div className="kw-blob" style={{ width: "80cqw", height: "80cqw", left: "-25cqw", top: "-10cqh", background: "#7B2CBF" }} />
      <div className="kw-blob" style={{ width: "70cqw", height: "70cqw", right: "-30cqw", top: "30cqh", background: "#E63946", animationDelay: "-3s" }} />
      <div className="kw-blob" style={{ width: "60cqw", height: "60cqw", left: "5cqw", bottom: "-20cqw", background: "#FFC629", opacity: 0.7, animationDelay: "-6s" }} />

      <div className="kw-sticker" style={{ right: "6cqw", top: "13cqh" }} aria-hidden>
        <svg viewBox="0 0 100 100">
          <path
            fill="#FFC629"
            d="M50 0l7.7 13.2 14.6-4.5 2.4 15.1 15.1 2.4-4.5 14.6L100 50l-13.2 7.7 4.5 14.6-15.1 2.4-2.4 15.1-14.6-4.5L50 100l-7.7-13.2-14.6 4.5-2.4-15.1-15.1-2.4 4.5-14.6L0 50l13.2-7.7-4.5-14.6 15.1-2.4 2.4-15.1 14.6 4.5z"
          />
        </svg>
        <span>{allTime ? <>All<br />time</> : <>Monthly<br />drop</>}</span>
      </div>

      {[
        { bg: "#FFC629", fg: "#10002B", rot: "-7deg", bottom: "27cqh", d: "1.9s", rev: false },
        { bg: "#E0AAFF", fg: "#3C096C", rot: "5deg", bottom: "16cqh", d: "2.05s", rev: true },
      ].map((t) => (
        <div
          key={t.bg}
          aria-hidden
          className={`kw-tape ${t.rev ? "kw-rev" : ""}`}
          style={css({ background: t.bg, color: t.fg, bottom: t.bottom, rotate: t.rot, "--d": t.d })}
        >
          <div>
            <span>{tape.repeat(6)}</span>
            <span>{tape.repeat(6)}</span>
          </div>
        </div>
      ))}

      <div className="kw-pad" style={{ justifyContent: "flex-start", paddingTop: "21cqh" }}>
        <p className="kw-eyebrow kw-rise" style={css({ "--d": "0.2s", color: "var(--kw-lavender)" })}>{s.eyebrow}</p>

        <h1 className="kw-h1 kw-word" style={{ margin: "2cqw 0 0" }}>
          {["#E63946", "#FFC629", "#C77DFF"].map((c, i) => (
            <span
              key={c}
              aria-hidden
              className="kw-echo"
              style={css({ "--c": c, "--d": `${0.9 + i * 0.12}s`, "--tx": `${(i + 1) * 0.9}cqw`, "--ty": `${(i + 1) * 1.3}cqw` })}
            >
              {s.title}
            </span>
          ))}
          <span style={{ position: "relative" }}>
            {letters.map((l, i) => (
              <span key={i} className="kw-letter" style={css({ "--i": i })}>{l}</span>
            ))}
          </span>
        </h1>

        <p className="kw-body kw-rise" style={css({ "--d": "1.4s", marginTop: "5cqw", maxWidth: "78cqw", opacity: 0.9 })}>
          {s.subtitle}
        </p>
        <div className="kw-rise" style={css({ "--d": "1.7s", marginTop: "5cqw" })}>
          <span className="kw-chip" style={{ background: "#fff", color: "var(--kw-ink)" }}>{s.restaurantName}</span>
        </div>
      </div>
      <p className="kw-hint">TAP TO BEGIN</p>
    </div>
  );
}

function Origin({ s }: { s: Extract<WrappedSlide, { kind: "origin" }> }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-gold)", color: "var(--kw-ink)" }}>
      <div className="kw-pad" style={{ justifyContent: "flex-start" }}>
        <p className="kw-h2">
          <Line d={0.2}>On {s.joinedLabel},</Line>
          <Line d={0.45}>you joined Kitchyn.</Line>
        </p>
        <p className="kw-body kw-rise" style={css({ "--d": "1.4s", marginTop: "6cqw" })}>That was</p>
        <p className="kw-num kw-zoom" style={css({ "--d": "1.6s", fontSize: fitSize(s.daysWithKitchyn.toLocaleString(), 30) })}>
          <Count value={s.daysWithKitchyn} delay={1600} duration={1600} />
        </p>
        <p className="kw-h2 kw-rise" style={css({ "--d": "2s", fontSize: "8cqw" })}>days ago.</p>

        {s.firstOrderNumber && s.firstOrderLabel && (
          <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
            <div className="kw-receipt" style={css({ "--d": "3.2s" })}>
              <p style={{ fontSize: "3cqw", fontWeight: 700, letterSpacing: "0.15em" }}>FIRST ORDER</p>
              <p style={{ fontSize: "8cqw", fontWeight: 800, marginTop: "1cqw" }}>#{s.firstOrderNumber}</p>
              <hr />
              <p style={{ fontSize: "3.4cqw" }}>{s.firstOrderLabel}</p>
              <p style={{ fontSize: "3.4cqw", marginTop: "1.5cqw", fontWeight: 700 }}>Where it all began ✦</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Orders({ s }: { s: Extract<WrappedSlide, { kind: "orders" }> }) {
  const dots = useMemo(() => {
    const r = seeded(s.orders + 3);
    const palette = ["#fff", "#FFC629", "#E0AAFF", "#E63946"];
    return Array.from({ length: 14 * 26 }, (_, i) => {
      const col = i % 14;
      const row = Math.floor(i / 14);
      return { d: `${0.1 + row * 0.05 + col * 0.02 + r() * 0.15}s`, c: palette[Math.floor(r() * (r() > 0.85 ? 4 : 1.4))] };
    });
  }, [s.orders]);
  const text = s.orders.toLocaleString("en-NG");
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-violet)" }}>
      <div className="kw-dots" aria-hidden>
        {dots.map((d, i) => (
          <i key={i} style={css({ "--d": d.d, "--c": d.c })} />
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 45% at 50% 50%, rgba(90,24,154,0.95), rgba(90,24,154,0.55) 60%, transparent)" }} />
      <div className="kw-pad" style={{ alignItems: "center", textAlign: "center" }}>
        <p className="kw-eyebrow kw-rise" style={css({ "--d": "0.6s", color: "var(--kw-lavender)" })}>You served</p>
        <p className="kw-num kw-zoom" style={css({ "--d": "0.8s", fontSize: fitSize(text, 40), marginTop: "3cqw", textShadow: "0 1.5cqw 0 #3C096C" })}>
          <Count value={s.orders} delay={800} duration={2200} />
        </p>
        <p className="kw-h2 kw-rise" style={css({ "--d": "1.3s", marginTop: "2cqw" })}>orders</p>
        <p className="kw-body kw-rise" style={css({ "--d": "2.6s", marginTop: "6cqw", maxWidth: "70cqw" })}>{s.caption}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2cqw", justifyContent: "center", marginTop: "6cqw" }}>
          {s.perDay !== null && (
            <span className="kw-chip kw-pop" style={css({ "--d": "3.2s", background: "var(--kw-gold)", color: "var(--kw-ink)" })}>
              ≈ {s.perDay.toLocaleString("en-NG")} a day
            </span>
          )}
          <Delta pct={s.deltaPct} label={s.deltaLabel} d={3.4} />
        </div>
      </div>
    </div>
  );
}

function Revenue({ s }: { s: Extract<WrappedSlide, { kind: "revenue" }> }) {
  const text = wrappedNaira(s.revenueKobo);
  const row = "₦ CHA-CHING ✦ ₦ KERCHING ✦ ";
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-ink)" }}>
      <div className="kw-marquee-wrap" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`kw-marquee ${i % 2 ? "kw-rev" : ""}`} style={{ color: i % 2 ? "#C77DFF" : "#FFC629" }}>
            <span>{row.repeat(4)}</span>
            <span>{row.repeat(4)}</span>
          </div>
        ))}
      </div>
      <div className="kw-pad">
        <p className="kw-h2">
          <Line d={0.3}>And all that</Line>
          <Line d={0.5}>cooking earned you</Line>
        </p>
        <p className="kw-num kw-shine kw-rise" style={css({ "--d": "1.1s", fontSize: fitSize(text, 22, 96), marginTop: "6cqw" })}>
          <Count value={s.revenueKobo} delay={1100} duration={2400} format={wrappedNaira} />
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2cqw", marginTop: "6cqw" }}>
          {s.aovKobo !== null && (
            <span className="kw-chip kw-pop" style={css({ "--d": "3s", background: "rgba(255,255,255,0.12)" })}>
              {wrappedNaira(s.aovKobo)} average order
            </span>
          )}
          <Delta pct={s.deltaPct} label={s.deltaLabel} d={3.2} />
        </div>
        <p className="kw-body kw-rise" style={css({ "--d": "3.6s", marginTop: "auto", opacity: 0.7, fontSize: "3.6cqw" })}>
          Sales through Kitchyn, before payout fees.
        </p>
      </div>
      <Confetti count={40} delay={3.3} seed={11} />
    </div>
  );
}

function TopDish({ s }: { s: Extract<WrappedSlide, { kind: "topDish" }> }) {
  const [imgOk, setImgOk] = useState(Boolean(s.imageUrl));
  const initial = s.name.trim().charAt(0).toUpperCase();
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-cream)", color: "var(--kw-ink)" }}>
      <div className="kw-pad" style={{ alignItems: "center", textAlign: "center", paddingTop: "16cqh" }}>
        <p className="kw-eyebrow kw-rise" style={css({ "--d": "3.2s", color: "var(--kw-coral)" })}>Your #1 dish</p>
        <div style={{ margin: "5cqw 0" }}>
          <div className="kw-plate">
            <div className="kw-plate-face">
              {imgOk && s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt="" onError={() => setImgOk(false)} />
              ) : (
                <span className="kw-num" style={{ fontSize: "20cqw", color: "var(--kw-ink)" }}>{initial}</span>
              )}
            </div>
          </div>
        </div>
        <p className="kw-h2" style={{ fontSize: fitSize(s.name, 11, 150) }}>
          <Line d={3.6}>{s.name}</Line>
        </p>
        <p className="kw-body kw-rise" style={css({ "--d": "4.1s", marginTop: "3cqw" })}>
          ordered <b style={{ fontWeight: 900 }}><Count value={s.quantity} delay={4100} duration={1500} /></b> times
        </p>
        <span className="kw-chip kw-pop" style={css({ "--d": "4.8s", marginTop: "4cqw", background: "var(--kw-ink)", color: "var(--kw-gold)" })}>
          {wrappedNaira(s.revenueKobo)} on its own
        </span>
      </div>

      {/* Teaser card that wipes away to reveal the dish. */}
      <div className="kw-tease" style={{ color: "#fff" }}>
        <span
          aria-hidden
          className="kw-num kw-zoom"
          style={css({ "--d": "0.1s", position: "absolute", right: "-12cqw", bottom: "-8cqh", fontSize: "110cqw", color: "transparent", WebkitTextStroke: "0.6cqw rgba(255,255,255,0.35)" })}
        >
          ?
        </span>
        <p className="kw-h2" style={{ fontSize: "12cqw" }}>
          <Line d={0.2}>One dish</Line>
          <Line d={0.4}>ran the</Line>
          <Line d={0.6}>whole show.</Line>
        </p>
        <p className="kw-body kw-rise" style={css({ "--d": "1.3s", marginTop: "5cqw" })}>Can you guess which?</p>
      </div>
    </div>
  );
}

function TopFive({ s }: { s: Extract<WrappedSlide, { kind: "topFive" }> }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-lavender)", color: "var(--kw-ink)" }}>
      <div className="kw-pad">
        <p className="kw-h2" style={{ fontSize: "12cqw" }}>
          <Line d={0.2}>Your top</Line>
          <Line d={0.35}>{s.items.length === 5 ? "five" : s.items.length === 4 ? "four" : "three"}</Line>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "6cqw", marginTop: "10cqw" }}>
          {s.items.map((item, i) => (
            <div key={item.name + i} className="kw-rank-row" style={css({ "--d": `${0.9 + i * 0.28}s` })}>
              <span className="kw-rank-n">{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "3cqw", alignItems: "baseline" }}>
                  <span style={{ fontSize: "5.4cqw", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                  <span style={{ fontSize: "3.6cqw", fontWeight: 700, opacity: 0.7, whiteSpace: "nowrap" }}>{item.quantity.toLocaleString("en-NG")}×</span>
                </div>
                <div className="kw-rank-bar" style={css({ width: `${item.pct}%`, marginTop: "1.6cqw", "--d": `${0.9 + i * 0.28}s`, opacity: 1 - i * 0.14 })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Customers({ s }: { s: Extract<WrappedSlide, { kind: "customers" }> }) {
  const bubbles = useMemo(() => {
    const r = seeded(s.customers + 1);
    const colors = ["#C77DFF", "#E0AAFF", "#FFC629", "#E63946", "#F4A261", "#9D4EDD"];
    return Array.from({ length: 22 }, (_, i) => {
      const size = 6 + r() * 16;
      return { left: `${r() * 100}%`, size: `${size}cqw`, c: colors[i % colors.length], d: `${r() * 6}s`, t: `${6 + r() * 5}s`, o: 0.35 + r() * 0.5 };
    });
  }, [s.customers]);
  const text = s.customers.toLocaleString("en-NG");
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-plum)" }}>
      {bubbles.map((b, i) => (
        <span key={i} className="kw-bubble" aria-hidden style={css({ left: b.left, width: b.size, height: b.size, background: b.c, "--d": b.d, "--t": b.t, filter: `opacity(${b.o})` })} />
      ))}
      <div className="kw-pad">
        <p className="kw-num kw-zoom" style={css({ "--d": "0.3s", fontSize: fitSize(text, 34) })}>
          <Count value={s.customers} delay={300} duration={1800} />
        </p>
        <p className="kw-h2" style={{ marginTop: "2cqw" }}>
          <Line d={0.8}>people ate from</Line>
          <Line d={1}>your kitchen.</Line>
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3cqw", marginTop: "9cqw" }}>
          <div className="kw-pop" style={css({ "--d": "2.2s", background: "var(--kw-gold)", color: "var(--kw-ink)", borderRadius: "5cqw", padding: "5cqw" })}>
            <p className="kw-num" style={{ fontSize: "11cqw" }}><Count value={s.repeatCustomers} delay={2300} /></p>
            <p style={{ fontSize: "3.6cqw", fontWeight: 700, marginTop: "1.5cqw" }}>came back for more</p>
          </div>
          <div className="kw-pop" style={css({ "--d": "2.5s", background: "#fff", color: "var(--kw-ink)", borderRadius: "5cqw", padding: "5cqw" })}>
            <p className="kw-num" style={{ fontSize: "11cqw" }}><Count value={s.newCustomers} delay={2600} /></p>
            <p style={{ fontSize: "3.6cqw", fontWeight: 700, marginTop: "1.5cqw" }}>tried you for the first time</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fan({ s }: { s: Extract<WrappedSlide, { kind: "fan" }> }) {
  const hearts = useMemo(() => {
    const r = seeded(s.orders + 5);
    return Array.from({ length: 16 }, () => {
      const a = r() * Math.PI * 2;
      const dist = 30 + r() * 30;
      return { tx: `${Math.cos(a) * dist}cqw`, ty: `${Math.sin(a) * dist}cqw`, r: `${(r() - 0.5) * 60}deg`, d: `${1.2 + r() * 2.4}s`, s: `${5 + r() * 6}cqw` };
    });
  }, [s.orders]);
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #E63946 0%, #F4A261 100%)" }}>
      {hearts.map((h, i) => (
        <span key={i} className="kw-heart" aria-hidden style={css({ "--tx": h.tx, "--ty": h.ty, "--r": h.r, "--d": h.d, "--s": h.s })}>♥</span>
      ))}
      <div className="kw-pad" style={{ alignItems: "center", textAlign: "center" }}>
        <p className="kw-eyebrow kw-rise" style={css({ "--d": "0.2s" })}>Your #1 fan</p>
        <Crown className="kw-crown" style={{ width: "16cqw", height: "16cqw", marginTop: "6cqw", color: "var(--kw-gold)", filter: "drop-shadow(0 1cqw 0 rgba(16,0,43,0.35))" }} strokeWidth={2.4} fill="currentColor" />
        <p className="kw-h1 kw-pop" style={css({ "--d": "0.9s", fontSize: fitSize(s.firstName, 24, 130), marginTop: "1cqw", textShadow: "0 1.4cqw 0 rgba(16,0,43,0.3)" })}>
          {s.firstName}
        </p>
        <p className="kw-h2" style={{ marginTop: "6cqw", fontSize: "8cqw" }}>
          <Line d={1.8}>
            <Count value={s.orders} delay={1800} /> orders.
          </Line>
          <Line d={2.1}>{wrappedNaira(s.spentKobo)} spent.</Line>
        </p>
        <p className="kw-body kw-rise" style={css({ "--d": "3s", marginTop: "5cqw" })}>That&rsquo;s not a customer. That&rsquo;s family.</p>
      </div>
    </div>
  );
}

const DAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

function Peak({ s }: { s: Extract<WrappedSlide, { kind: "peak" }> }) {
  const max = Math.max(...s.weekdayCounts, 1);
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 100%, #3C096C, #10002B 60%)" }}>
      <div className="kw-pad">
        <p className="kw-eyebrow kw-rise" style={css({ "--d": "0.2s", color: "var(--kw-lilac)" })}>Your kitchen&rsquo;s big day</p>
        <p className="kw-h1" style={{ fontSize: fitSize(s.busiestDay + "s", 19, 120), marginTop: "3cqw", color: "var(--kw-gold)" }}>
          <Line d={0.5}>{s.busiestDay}s</Line>
        </p>
        <div className="kw-week" style={{ marginTop: "10cqw" }}>
          {s.weekdayCounts.map((n, i) => (
            <div key={i} className="kw-week-col">
              <div
                className={`kw-week-bar ${i === s.busiestIndex ? "kw-hot" : ""}`}
                style={css({ height: `${Math.max(6, (n / max) * 100)}%`, "--d": `${1.1 + i * 0.09}s` })}
              />
              <small style={i === s.busiestIndex ? { opacity: 1, color: "var(--kw-gold)" } : undefined}>{DAY_SHORT[i]}</small>
            </div>
          ))}
        </div>
        {s.peakHourLabel && (
          <p className="kw-h2 kw-rise" style={css({ "--d": "2.4s", marginTop: "9cqw", fontSize: "8cqw" })}>
            Things get hottest around <span style={{ color: "var(--kw-coral)" }}>{s.peakHourLabel}</span>.
          </p>
        )}
      </div>
    </div>
  );
}

function BestDay({ s }: { s: Extract<WrappedSlide, { kind: "bestDay" }> }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-gold)", color: "var(--kw-ink)" }}>
      <div className="kw-pad" style={{ alignItems: "center", textAlign: "center" }}>
        <p className="kw-h2" style={{ fontSize: "10cqw" }}>
          <Line d={0.1}>Your record</Line>
          <Line d={0.3}>day ever</Line>
        </p>
        <div className="kw-cal" style={{ marginTop: "8cqw" }}>
          <div className="kw-cal-top">{s.month}</div>
          <p className="kw-num" style={{ fontSize: "30cqw", padding: "4cqw 0 0" }}>{s.day}</p>
          <p style={{ fontSize: "4.4cqw", fontWeight: 700, paddingBottom: "5cqw", opacity: 0.6 }}>{s.weekday}</p>
        </div>
        <p className="kw-h2 kw-rise" style={css({ "--d": "1.8s", marginTop: "9cqw", fontSize: "8cqw" })}>
          <Count value={s.orders} delay={1800} /> orders in one day.
        </p>
        <p className="kw-body kw-rise" style={css({ "--d": "2.3s", marginTop: "2cqw" })}>
          {wrappedNaira(s.revenueKobo)} before the kitchen lights went off.
        </p>
      </div>
    </div>
  );
}

function Reviews({ s }: { s: Extract<WrappedSlide, { kind: "reviews" }> }) {
  const avg = useCountUp(s.avg, { delay: 600, duration: 1800, decimals: 1 });
  const full = Math.round(s.avg);
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-violet)" }}>
      <div className="kw-blob" style={{ width: "90cqw", height: "90cqw", right: "-40cqw", top: "-20cqw", background: "#C77DFF", opacity: 0.5 }} />
      <div className="kw-pad">
        <p className="kw-eyebrow kw-rise" style={css({ "--d": "0.2s", color: "var(--kw-lavender)" })}>Customers rated you</p>
        <p className="kw-num kw-zoom" style={css({ "--d": "0.4s", fontSize: "36cqw", marginTop: "2cqw" })}>{avg.toFixed(1)}</p>
        <div style={{ display: "flex", gap: "1.5cqw", marginTop: "2cqw" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star
              key={i}
              className="kw-star"
              style={css({ "--d": `${0.8 + i * 0.15}s`, color: i < full ? "var(--kw-gold)" : "rgba(255,255,255,0.3)" })}
              fill="currentColor"
              strokeWidth={0}
            />
          ))}
        </div>
        <p className="kw-body kw-rise" style={css({ "--d": "1.8s", marginTop: "4cqw" })}>
          from {s.count.toLocaleString("en-NG")} review{s.count === 1 ? "" : "s"}
          {s.fiveStar > 0 ? ` · ${s.fiveStar.toLocaleString("en-NG")} five-star` : ""}
        </p>
        {s.quote && (
          <div className="kw-quote kw-rise" style={css({ "--d": "2.6s", marginTop: "8cqw" })}>
            <Quote style={{ position: "absolute", top: "-4cqw", left: "5cqw", width: "10cqw", height: "10cqw", color: "var(--kw-gold)" }} fill="currentColor" strokeWidth={0} />
            <p style={{ fontSize: "5.2cqw", fontWeight: 700, lineHeight: 1.3 }}>{s.quote.comment}</p>
            <p style={{ fontSize: "3.6cqw", fontWeight: 600, marginTop: "3cqw", opacity: 0.75 }}>— {s.quote.name}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Rank({ s }: { s: Extract<WrappedSlide, { kind: "rank" }> }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-ink)" }}>
      <div className="kw-rays" aria-hidden />
      <div className="kw-pad" style={{ alignItems: "center", textAlign: "center" }}>
        <p className="kw-h2" style={{ fontSize: "9cqw" }}>
          <Line d={0.2}>You&rsquo;re in the</Line>
        </p>
        <p className="kw-num kw-shine kw-zoom" style={css({ "--d": "0.7s", fontSize: "34cqw", marginTop: "2cqw" })}>
          top {s.topPercent}%
        </p>
        <p className="kw-h2" style={{ fontSize: "9cqw", marginTop: "3cqw" }}>
          <Line d={1.4}>of kitchens on</Line>
          <Line d={1.6}>Kitchyn.</Line>
        </p>
        <p className="kw-body kw-rise" style={css({ "--d": "2.6s", marginTop: "6cqw", opacity: 0.8 })}>
          Ranked #{s.rank} of {s.total} by orders. Elite company.
        </p>
      </div>
      <Confetti count={90} delay={1} seed={23} />
    </div>
  );
}

function Fulfilment({ s }: { s: Extract<WrappedSlide, { kind: "fulfilment" }> }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--kw-ink)" }}>
      <div className="kw-split">
        <div style={css({ background: "var(--kw-grape)", "--g": Math.max(s.deliveryPct, 22) })}>
          <p className="kw-eyebrow kw-fade" style={css({ "--d": "0.3s", position: "absolute", top: "18cqh", left: "8cqw", color: "var(--kw-lavender)" })}>
            How they got their food
          </p>
          <Bike className="kw-pop" style={css({ "--d": "1.2s", width: "11cqw", height: "11cqw", color: "var(--kw-gold)" })} strokeWidth={2.2} />
          <p className="kw-num kw-rise" style={css({ "--d": "1.4s", fontSize: "20cqw", marginTop: "2cqw" })}>
            <Count value={s.deliveryPct} delay={1400} />%
          </p>
          <p className="kw-body kw-rise" style={css({ "--d": "1.6s" })}>delivered · {s.delivery.toLocaleString("en-NG")} orders</p>
        </div>
        <div style={css({ background: "var(--kw-gold)", color: "var(--kw-ink)", "--g": Math.max(s.pickupPct, 22) })}>
          <ShoppingBag className="kw-pop" style={css({ "--d": "1.6s", width: "11cqw", height: "11cqw" })} strokeWidth={2.2} />
          <p className="kw-num kw-rise" style={css({ "--d": "1.8s", fontSize: "20cqw", marginTop: "2cqw" })}>
            <Count value={s.pickupPct} delay={1800} />%
          </p>
          <p className="kw-body kw-rise" style={css({ "--d": "2s" })}>picked up · {s.pickup.toLocaleString("en-NG")} orders</p>
        </div>
      </div>
    </div>
  );
}

function Summary({
  s,
  onShare,
  onReplay,
  sharing,
}: {
  s: Extract<WrappedSlide, { kind: "summary" }>;
  onShare: () => void;
  onReplay: () => void;
  sharing: boolean;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 70% at 50% 0%, #3C096C, #07000F 70%)" }}>
      <div className="kw-pad" style={{ paddingTop: "14cqh", paddingBottom: "6cqh", justifyContent: "space-between", gap: "5cqw" }}>
        <div className="kw-card">
          <div className="kw-blob" style={{ width: "60cqw", height: "60cqw", right: "-25cqw", top: "-25cqw", background: "#E63946", opacity: 0.55 }} />
          <div className="kw-blob" style={{ width: "50cqw", height: "50cqw", left: "-20cqw", bottom: "-25cqw", background: "#FFC629", opacity: 0.35 }} />
          <div style={{ position: "relative" }}>
            <p className="kw-eyebrow" style={{ color: "var(--kw-gold)", fontSize: "3.2cqw" }}>{s.periodLabel}</p>
            <p className="kw-h2" style={{ marginTop: "2cqw", fontSize: fitSize(s.restaurantName, 9.5, 130) }}>{s.restaurantName}</p>
            <div className="kw-card-grid" style={{ marginTop: "7cqw" }}>
              {s.stats.map((st, i) => (
                <div key={st.label} className="kw-rise" style={css({ "--d": `${0.8 + i * 0.12}s` })}>
                  <p style={{ fontSize: "3cqw", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>{st.label}</p>
                  <p className="kw-num" style={{ fontSize: "9.5cqw", marginTop: "1cqw" }}>{st.value}</p>
                </div>
              ))}
            </div>
            {(s.topDish || s.busiestDay) && (
              <div className="kw-rise" style={css({ "--d": "1.4s", marginTop: "6cqw", paddingTop: "5cqw", borderTop: "0.3cqw solid rgba(255,255,255,0.15)", display: "grid", gap: "2.5cqw" })}>
                {s.topDish && (
                  <p style={{ fontSize: "3.8cqw" }}>
                    <span style={{ opacity: 0.6 }}>Top dish </span>
                    <b style={{ fontWeight: 800 }}>{s.topDish}</b>
                  </p>
                )}
                {s.busiestDay && (
                  <p style={{ fontSize: "3.8cqw" }}>
                    <span style={{ opacity: 0.6 }}>Big day </span>
                    <b style={{ fontWeight: 800 }}>{s.busiestDay}s</b>
                  </p>
                )}
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Kitchyn" style={{ height: "5cqw", marginTop: "7cqw", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
          </div>
        </div>

        <div className="kw-rise" style={css({ "--d": "1.8s", display: "flex", gap: "3cqw" })}>
          <button
            type="button"
            className="kw-btn"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={sharing}
            style={{ flex: 1, background: "var(--kw-gold)", color: "var(--kw-ink)", opacity: sharing ? 0.7 : 1 }}
          >
            <Download style={{ width: "4.6cqw", height: "4.6cqw" }} strokeWidth={2.6} />
            {sharing ? "Preparing…" : "Save & share"}
          </button>
          <button
            type="button"
            className="kw-btn"
            onClick={(e) => {
              e.stopPropagation();
              onReplay();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Watch again"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff", padding: "0 5cqw" }}
          >
            <RotateCcw style={{ width: "4.6cqw", height: "4.6cqw" }} strokeWidth={2.6} />
          </button>
        </div>
      </div>
      <Confetti count={60} delay={0.4} seed={41} />
    </div>
  );
}

export function WrappedSlideView({
  slide,
  onShare,
  onReplay,
  sharing,
}: {
  slide: WrappedSlide;
  onShare: () => void;
  onReplay: () => void;
  sharing: boolean;
}) {
  switch (slide.kind) {
    case "intro": return <Intro s={slide} />;
    case "origin": return <Origin s={slide} />;
    case "orders": return <Orders s={slide} />;
    case "revenue": return <Revenue s={slide} />;
    case "topDish": return <TopDish s={slide} />;
    case "topFive": return <TopFive s={slide} />;
    case "customers": return <Customers s={slide} />;
    case "fan": return <Fan s={slide} />;
    case "peak": return <Peak s={slide} />;
    case "bestDay": return <BestDay s={slide} />;
    case "reviews": return <Reviews s={slide} />;
    case "rank": return <Rank s={slide} />;
    case "fulfilment": return <Fulfilment s={slide} />;
    case "summary": return <Summary s={slide} onShare={onShare} onReplay={onReplay} sharing={sharing} />;
  }
}
