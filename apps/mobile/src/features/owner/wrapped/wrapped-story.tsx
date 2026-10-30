/**
 * Kitchyn Wrapped — full-screen story for the mobile owner app.
 *
 * RN sibling of the web story (apps/web/components/dashboard/wrapped). The
 * slide list and every word of copy come from buildWrappedSlides() in
 * @foodo/utils, so web and mobile tell the same story card for card; this file
 * decides how each card looks and moves on a phone.
 *
 * Controls: tap right for next, tap left to go back, press and hold to pause,
 * ✕ or the Android back button to close. Cards auto-advance; the summary stays.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, Share, StatusBar, Text, View, Image, useWindowDimensions, type TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { Bike, Crown, Pause, Play, RotateCcw, Share2, ShoppingBag, Star, X } from "lucide-react-native";
import {
  buildWrappedSlides,
  wrappedNaira,
  wrappedPeriodLabel,
  type WrappedEdition,
  type WrappedSlide,
  type WrappedSlideKind,
} from "@foodo/utils";

import { capture } from "../../../lib/observability";

const C = {
  ink: "#10002B",
  night: "#07000F",
  plum: "#3C096C",
  grape: "#5A189A",
  violet: "#7B2CBF",
  lilac: "#C77DFF",
  lavender: "#E0AAFF",
  gold: "#FFC629",
  coral: "#E63946",
  peach: "#F4A261",
  cream: "#FFF8EC",
};

const DISPLAY = "Poppins_800ExtraBold";
const BODY = "Poppins_600SemiBold";

const META: Record<WrappedSlideKind, { duration: number; light: boolean }> = {
  intro: { duration: 6000, light: false },
  origin: { duration: 7000, light: true },
  orders: { duration: 6500, light: false },
  revenue: { duration: 6500, light: false },
  topDish: { duration: 8000, light: true },
  topFive: { duration: 7500, light: true },
  customers: { duration: 7000, light: false },
  fan: { duration: 7000, light: false },
  peak: { duration: 7000, light: false },
  bestDay: { duration: 6500, light: true },
  reviews: { duration: 8000, light: false },
  rank: { duration: 7000, light: false },
  fulfilment: { duration: 6500, light: false },
  summary: { duration: 0, light: false },
};

const logo = require("../../../../assets/logo.png");

// ── Helpers ────────────────────────────────────────────────────────────────

function useCountUp(target: number, delay = 0, duration = 1600, paused = false, decimals = 0) {
  const [value, setValue] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    let raf = 0;
    let elapsed = -delay;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      if (!pausedRef.current) elapsed += now - last;
      last = now;
      const t = Math.max(0, Math.min(1, elapsed / duration));
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const f = Math.pow(10, decimals);
      setValue(Math.round(target * eased * f) / f);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, duration, decimals]);
  return value;
}

function Count({ value, delay, paused, format }: { value: number; delay?: number; paused: boolean; format?: (n: number) => string }) {
  const n = useCountUp(value, delay, 1600, paused);
  return <>{format ? format(n) : n.toLocaleString("en-NG")}</>;
}

function fit(text: string, max: number, width: number, budget = 0.95) {
  return Math.min(max, (width * budget) / Math.max(1, text.length * 0.62));
}

function T({ style, children, d = 0, from = "down" }: { style?: TextStyle | TextStyle[]; children: ReactNode; d?: number; from?: "down" | "up" | "zoom" | "right" | "fade" }) {
  const entering =
    from === "zoom" ? ZoomIn.delay(d).springify().damping(14)
    : from === "right" ? FadeInRight.delay(d).duration(600)
    : from === "fade" ? FadeIn.delay(d).duration(600)
    : from === "up" ? FadeInUp.delay(d).duration(700)
    : FadeInDown.delay(d).duration(700).springify().damping(16);
  return (
    <Animated.Text entering={entering} style={style}>
      {children}
    </Animated.Text>
  );
}

function Blob({ size, color, style, drift = 1 }: { size: number; color: string; style: object; drift?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 6000 + drift * 1500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, drift]);
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: (t.value - 0.5) * 40 * drift }, { translateY: (0.5 - t.value) * 30 }, { scale: 1 + t.value * 0.12 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.55 }, style, a]}
    />
  );
}

function Spin({ children, duration = 12000, style }: { children: ReactNode; duration?: number; style?: object }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
  }, [r, duration]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

const h = (size: number, color = "#fff"): TextStyle => ({ fontFamily: DISPLAY, fontSize: size, lineHeight: size * 1.05, color, letterSpacing: -size * 0.03 });
const b = (size: number, color = "#fff", o = 1): TextStyle => ({ fontFamily: BODY, fontSize: size, lineHeight: size * 1.35, color, opacity: o });
const eyebrow = (color: string): TextStyle => ({ fontFamily: DISPLAY, fontSize: 13, letterSpacing: 2.2, color, textTransform: "uppercase" });

function Chip({ children, bg, fg, d = 0 }: { children: ReactNode; bg: string; fg: string; d?: number }) {
  return (
    <Animated.View entering={ZoomIn.delay(d).springify().damping(12)} style={{ alignSelf: "flex-start", backgroundColor: bg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
      <Text style={{ fontFamily: DISPLAY, fontSize: 13, color: fg }}>{children}</Text>
    </Animated.View>
  );
}

function Delta({ pct, label, d }: { pct: number | null; label: string | null; d: number }) {
  if (pct === null || !label) return null;
  return (
    <Chip bg={pct >= 0 ? "#B8F2D0" : "rgba(255,255,255,0.15)"} fg={pct >= 0 ? "#0B5A35" : "#fff"} d={d}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% {label}
    </Chip>
  );
}

// ── Slides ─────────────────────────────────────────────────────────────────

type SlideProps<K extends WrappedSlideKind> = { s: Extract<WrappedSlide, { kind: K }>; w: number; paused: boolean };

const PAD = { flex: 1, paddingHorizontal: 28, paddingTop: 120, paddingBottom: 48, justifyContent: "center" as const };

function Intro({ s, w }: SlideProps<"intro">) {
  const allTime = s.eyebrow.toLowerCase().includes("so far");
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Blob size={w * 0.9} color={C.violet} style={{ left: -w * 0.3, top: -w * 0.1 }} />
      <Blob size={w * 0.8} color={C.coral} style={{ right: -w * 0.35, top: w * 0.7 }} drift={-1.2} />
      <Blob size={w * 0.7} color={C.gold} style={{ left: w * 0.05, bottom: -w * 0.3 }} drift={0.8} />
      <Animated.View entering={ZoomIn.delay(1200).springify()} style={{ position: "absolute", right: 24, top: 130 }}>
        <Spin style={{ width: w * 0.26, height: w * 0.26, borderRadius: w * 0.13, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: DISPLAY, fontSize: 13, color: C.ink, textAlign: "center" }}>{allTime ? "ALL\nTIME" : "MONTHLY\nDROP"}</Text>
        </Spin>
      </Animated.View>
      <View style={[PAD, { justifyContent: "flex-start", paddingTop: 200 }]}>
        <T style={eyebrow(C.lavender)} d={200}>{s.eyebrow}</T>
        <View style={{ flexDirection: "row", marginTop: 6 }}>
          {s.title.split("").map((l, i) => (
            <Animated.Text key={i} entering={FadeInDown.delay(350 + i * 60).springify().damping(10)} style={h(w * 0.185)}>
              {l}
            </Animated.Text>
          ))}
        </View>
        <T style={[b(17, "#fff", 0.9), { marginTop: 16, maxWidth: w * 0.8 }]} d={1300}>{s.subtitle}</T>
        <View style={{ marginTop: 18 }}>
          <Chip bg="#fff" fg={C.ink} d={1600}>{s.restaurantName}</Chip>
        </View>
      </View>
      <T style={[b(13, "#fff", 0.7), { position: "absolute", bottom: 40, alignSelf: "center", letterSpacing: 2 }]} d={2200} from="fade">
        TAP TO BEGIN
      </T>
    </View>
  );
}

function Origin({ s, w, paused }: SlideProps<"origin">) {
  return (
    <View style={{ flex: 1, backgroundColor: C.gold }}>
      <View style={[PAD, { justifyContent: "flex-start", paddingTop: 140 }]}>
        <T style={h(34, C.ink)} d={200}>On {s.joinedLabel},</T>
        <T style={h(34, C.ink)} d={400}>you joined Kitchyn.</T>
        <T style={[b(17, C.ink), { marginTop: 22 }]} d={1300}>That was</T>
        <T style={h(fit(String(s.daysWithKitchyn), w * 0.3, w), C.ink)} d={1500} from="zoom">
          <Count value={s.daysWithKitchyn} delay={1500} paused={paused} />
        </T>
        <T style={h(30, C.ink)} d={1900}>days ago.</T>
        {s.firstOrderNumber && s.firstOrderLabel ? (
          <Animated.View
            entering={FadeInUp.delay(3000).springify().damping(12)}
            style={{ alignSelf: "flex-end", marginTop: 34, backgroundColor: "#fff", padding: 18, width: w * 0.6, transform: [{ rotate: "-4deg" }], shadowColor: C.ink, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}
          >
            <Text style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: 2, color: C.ink, fontWeight: "700" }}>FIRST ORDER</Text>
            <Text style={{ fontFamily: "monospace", fontSize: 26, color: C.ink, fontWeight: "800", marginTop: 4 }}>#{s.firstOrderNumber}</Text>
            <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "rgba(16,0,43,0.3)", marginVertical: 10 }} />
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: C.ink }}>{s.firstOrderLabel}</Text>
            <Text style={{ fontFamily: "monospace", fontSize: 12, color: C.ink, fontWeight: "700", marginTop: 4 }}>Where it all began ✦</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function Orders({ s, w, paused }: SlideProps<"orders">) {
  const cols = 9;
  const dots = useMemo(() => Array.from({ length: cols * 15 }, (_, i) => i), []);
  const palette = ["#fff", "#fff", "#fff", C.gold, C.lavender, C.coral];
  const size = w / cols;
  return (
    <View style={{ flex: 1, backgroundColor: C.violet }}>
      <View pointerEvents="none" style={{ position: "absolute", inset: 0, flexDirection: "row", flexWrap: "wrap", opacity: 0.45 }}>
        {dots.map((i) => (
          <Animated.View
            key={i}
            entering={ZoomIn.delay(100 + Math.floor(i / cols) * 55 + (i % cols) * 25).duration(400)}
            style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: size * 0.32, height: size * 0.32, borderRadius: size, backgroundColor: palette[(i * 7) % palette.length] }} />
          </Animated.View>
        ))}
      </View>
      <LinearGradient colors={["rgba(90,24,154,0)", "rgba(90,24,154,0.95)", "rgba(90,24,154,0)"]} style={{ position: "absolute", left: 0, right: 0, top: "22%", height: "56%" }} />
      <View style={[PAD, { alignItems: "center" }]}>
        <T style={eyebrow(C.lavender)} d={500}>You served</T>
        <T style={[h(fit(s.orders.toLocaleString("en-NG"), w * 0.38, w)), { marginTop: 8, textShadowColor: C.plum, textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 0 }]} d={700} from="zoom">
          <Count value={s.orders} delay={700} paused={paused} />
        </T>
        <T style={h(36)} d={1200}>orders</T>
        <T style={[b(17), { textAlign: "center", marginTop: 20, maxWidth: w * 0.75 }]} d={2400}>{s.caption}</T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {s.perDay !== null ? <Chip bg={C.gold} fg={C.ink} d={3000}>≈ {s.perDay.toLocaleString("en-NG")} a day</Chip> : null}
          <Delta pct={s.deltaPct} label={s.deltaLabel} d={3200} />
        </View>
      </View>
    </View>
  );
}

function Revenue({ s, w, paused }: SlideProps<"revenue">) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <View pointerEvents="none" style={{ position: "absolute", left: -w * 0.4, right: -w * 0.4, top: "8%", bottom: "8%", justifyContent: "space-around", opacity: 0.12, transform: [{ rotate: "-12deg" }] }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Text key={i} numberOfLines={1} style={h(w * 0.15, i % 2 ? C.lilac : C.gold)}>₦ CHA-CHING ✦ ₦ KERCHING ✦ ₦ CHA-CHING</Text>
        ))}
      </View>
      <View style={PAD}>
        <T style={h(34)} d={300}>And all that</T>
        <T style={h(34)} d={500}>cooking earned you</T>
        <T style={[h(fit(wrappedNaira(s.revenueKobo), w * 0.2, w, 0.88), C.gold), { marginTop: 22 }]} d={1000} from="zoom">
          <Count value={s.revenueKobo} delay={1000} paused={paused} format={wrappedNaira} />
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
          {s.aovKobo !== null ? <Chip bg="rgba(255,255,255,0.14)" fg="#fff" d={2800}>{wrappedNaira(s.aovKobo)} average order</Chip> : null}
          <Delta pct={s.deltaPct} label={s.deltaLabel} d={3000} />
        </View>
        <T style={[b(13, "#fff", 0.6), { marginTop: 28 }]} d={3400} from="fade">Sales through Kitchyn, before payout fees.</T>
      </View>
    </View>
  );
}

function TopDish({ s, w, paused }: SlideProps<"topDish">) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setRevealed(true), 2600);
    return () => clearTimeout(t);
  }, [paused]);
  const plate = w * 0.6;
  if (!revealed) {
    return (
      <View style={{ flex: 1, backgroundColor: C.coral }}>
        <T style={[h(w * 1.1, "transparent"), { position: "absolute", right: -w * 0.1, bottom: -w * 0.2, color: "rgba(255,255,255,0.18)" }]} d={100} from="zoom">?</T>
        <View style={PAD}>
          <T style={h(46)} d={200}>One dish</T>
          <T style={h(46)} d={400}>ran the</T>
          <T style={h(46)} d={600}>whole show.</T>
          <T style={[b(17), { marginTop: 18 }]} d={1300}>Can you guess which?</T>
        </View>
      </View>
    );
  }
  return (
    <Animated.View entering={ZoomIn.duration(500)} style={{ flex: 1, backgroundColor: C.cream }}>
      <View style={[PAD, { alignItems: "center" }]}>
        <T style={eyebrow(C.coral)} d={200}>Your #1 dish</T>
        <Animated.View entering={ZoomIn.delay(300).springify().damping(10)} style={{ marginVertical: 24 }}>
          <Spin duration={9000} style={{ width: plate, height: plate, borderRadius: plate / 2, backgroundColor: "#1A0536", borderWidth: 8, borderColor: "#2E0A56", alignItems: "center", justifyContent: "center" }}>
            {[0.92, 0.82, 0.72].map((r) => (
              <View key={r} style={{ position: "absolute", width: plate * r, height: plate * r, borderRadius: plate, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }} />
            ))}
            <View style={{ width: plate * 0.56, height: plate * 0.56, borderRadius: plate, overflow: "hidden", backgroundColor: C.gold, borderWidth: 5, borderColor: C.cream, alignItems: "center", justifyContent: "center" }}>
              {s.imageUrl ? (
                <Image source={{ uri: s.imageUrl }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text style={h(plate * 0.25, C.ink)}>{s.name.trim().charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </Spin>
        </Animated.View>
        <T style={[h(fit(s.name, 42, w, 1.4), C.ink), { textAlign: "center" }]} d={600}>{s.name}</T>
        <T style={[b(17, C.ink), { marginTop: 8 }]} d={1000}>
          ordered <Count value={s.quantity} delay={1000} paused={paused} /> times
        </T>
        <View style={{ marginTop: 14 }}>
          <Chip bg={C.ink} fg={C.gold} d={1600}>{wrappedNaira(s.revenueKobo)} on its own</Chip>
        </View>
      </View>
    </Animated.View>
  );
}

function TopFive({ s }: SlideProps<"topFive">) {
  const word = s.items.length === 5 ? "five" : s.items.length === 4 ? "four" : "three";
  return (
    <View style={{ flex: 1, backgroundColor: C.lavender }}>
      <View style={PAD}>
        <T style={h(46, C.ink)} d={200}>Your top</T>
        <T style={h(46, C.ink)} d={350}>{word}</T>
        <View style={{ gap: 22, marginTop: 34 }}>
          {s.items.map((it, i) => (
            <Animated.View key={it.name + i} entering={FadeInRight.delay(900 + i * 260).duration(700)} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Text style={[h(44, i === 0 ? C.plum : "rgba(60,9,108,0.45)"), { width: 40, textAlign: "center" }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: DISPLAY, fontSize: 19, color: C.ink }}>{it.name}</Text>
                  <Text style={{ fontFamily: BODY, fontSize: 13, color: C.ink, opacity: 0.7 }}>{it.quantity.toLocaleString("en-NG")}×</Text>
                </View>
                <Animated.View entering={FadeInRight.delay(1150 + i * 260).duration(900)} style={{ height: 7, borderRadius: 99, marginTop: 6, width: `${it.pct}%`, backgroundColor: C.plum, opacity: 1 - i * 0.14 }} />
              </View>
            </Animated.View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Customers({ s, w, paused }: SlideProps<"customers">) {
  return (
    <View style={{ flex: 1, backgroundColor: C.plum }}>
      {[C.lilac, C.gold, C.coral, C.peach, C.lavender].map((c, i) => (
        <Blob key={c} size={w * (0.18 + (i % 3) * 0.1)} color={c} style={{ left: (i * w) / 5, top: 120 + ((i * 173) % 500) }} drift={i % 2 ? 1.4 : -1.1} />
      ))}
      <View style={PAD}>
        <T style={h(fit(s.customers.toLocaleString("en-NG"), w * 0.32, w))} d={300} from="zoom">
          <Count value={s.customers} delay={300} paused={paused} />
        </T>
        <T style={h(34)} d={800}>people ate from</T>
        <T style={h(34)} d={1000}>your kitchen.</T>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 30 }}>
          {[
            { n: s.repeatCustomers, label: "came back for more", bg: C.gold, d: 2100 },
            { n: s.newCustomers, label: "tried you for the first time", bg: "#fff", d: 2400 },
          ].map((c) => (
            <Animated.View key={c.label} entering={ZoomIn.delay(c.d).springify().damping(12)} style={{ flex: 1, backgroundColor: c.bg, borderRadius: 20, padding: 18 }}>
              <Text style={h(40, C.ink)}><Count value={c.n} delay={c.d} paused={paused} /></Text>
              <Text style={{ fontFamily: BODY, fontSize: 13, color: C.ink, marginTop: 4 }}>{c.label}</Text>
            </Animated.View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Fan({ s, w, paused }: SlideProps<"fan">) {
  return (
    <LinearGradient colors={[C.coral, C.peach]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ flex: 1 }}>
      <View style={[PAD, { alignItems: "center" }]}>
        <T style={eyebrow("#fff")} d={200}>Your #1 fan</T>
        <Animated.View entering={FadeInDown.delay(600).springify().damping(8)} style={{ marginTop: 22, transform: [{ rotate: "-8deg" }] }}>
          <Crown size={w * 0.16} color={C.gold} fill={C.gold} strokeWidth={2.4} />
        </Animated.View>
        <T style={[h(fit(s.firstName, w * 0.24, w, 1.2)), { textShadowColor: "rgba(16,0,43,0.3)", textShadowOffset: { width: 0, height: 5 }, textShadowRadius: 0 }]} d={900} from="zoom">
          {s.firstName}
        </T>
        <T style={[h(30), { marginTop: 22 }]} d={1800}>
          <Count value={s.orders} delay={1800} paused={paused} /> orders.
        </T>
        <T style={h(30)} d={2100}>{wrappedNaira(s.spentKobo)} spent.</T>
        <T style={[b(17), { marginTop: 16 }]} d={3000}>That&rsquo;s not a customer. That&rsquo;s family.</T>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <T key={i} style={[h(22 + (i % 3) * 8, "rgba(255,255,255,0.8)"), { position: "absolute", left: `${10 + i * 15}%`, top: `${20 + ((i * 37) % 60)}%` }]} d={1200 + i * 250} from="zoom">
            ♥
          </T>
        ))}
      </View>
    </LinearGradient>
  );
}

const DAY_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

function Peak({ s, w }: SlideProps<"peak">) {
  const max = Math.max(...s.weekdayCounts, 1);
  const chartH = w * 0.48;
  return (
    <LinearGradient colors={[C.ink, C.ink, C.plum]} style={{ flex: 1 }}>
      <View style={PAD}>
        <T style={eyebrow(C.lilac)} d={200}>Your kitchen&rsquo;s big day</T>
        <T style={[h(fit(s.busiestDay + "s", w * 0.19, w, 1.2), C.gold), { marginTop: 8 }]} d={500}>{s.busiestDay}s</T>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: chartH, marginTop: 34 }}>
          {s.weekdayCounts.map((n, i) => {
            const hot = i === s.busiestIndex;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <Animated.View entering={FadeInUp.delay(1000 + i * 90).springify().damping(12)} style={{ width: "100%", height: Math.max(8, (n / max) * (chartH - 24)), borderRadius: 8, overflow: "hidden", backgroundColor: hot ? undefined : "rgba(199,125,255,0.35)" }}>
                  {hot ? <LinearGradient colors={[C.gold, C.coral]} style={{ flex: 1 }} /> : null}
                </Animated.View>
                <Text style={{ fontFamily: DISPLAY, fontSize: 12, color: hot ? C.gold : "rgba(255,255,255,0.6)" }}>{DAY_SHORT[i]}</Text>
              </View>
            );
          })}
        </View>
        {s.peakHourLabel ? (
          <T style={[h(30), { marginTop: 34 }]} d={2300}>
            Things get hottest around <Text style={{ color: C.coral }}>{s.peakHourLabel}</Text>.
          </T>
        ) : null}
      </View>
    </LinearGradient>
  );
}

function BestDay({ s, w, paused }: SlideProps<"bestDay">) {
  return (
    <View style={{ flex: 1, backgroundColor: C.gold }}>
      <View style={[PAD, { alignItems: "center" }]}>
        <T style={h(40, C.ink)} d={100}>Your record</T>
        <T style={h(40, C.ink)} d={300}>day ever</T>
        <Animated.View entering={FadeInDown.delay(500).springify().damping(9)} style={{ marginTop: 28, width: w * 0.58, borderRadius: 22, overflow: "hidden", backgroundColor: "#fff", transform: [{ rotate: "-3deg" }], shadowColor: C.ink, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 10 }}>
          <Text style={{ backgroundColor: C.coral, color: "#fff", textAlign: "center", fontFamily: DISPLAY, fontSize: 18, letterSpacing: 1.5, paddingVertical: 10 }}>{s.month.toUpperCase()}</Text>
          <Text style={[h(w * 0.28, C.ink), { textAlign: "center", paddingTop: 12 }]}>{s.day}</Text>
          <Text style={{ textAlign: "center", fontFamily: BODY, fontSize: 16, color: C.ink, opacity: 0.6, paddingBottom: 16 }}>{s.weekday}</Text>
        </Animated.View>
        <T style={[h(28, C.ink), { marginTop: 32, textAlign: "center" }]} d={1700}>
          <Count value={s.orders} delay={1700} paused={paused} /> orders in one day.
        </T>
        <T style={[b(16, C.ink), { textAlign: "center", marginTop: 6 }]} d={2200}>{wrappedNaira(s.revenueKobo)} before the kitchen lights went off.</T>
      </View>
    </View>
  );
}

function Reviews({ s, w, paused }: SlideProps<"reviews">) {
  const avg = useCountUp(s.avg, 500, 1600, paused, 1);
  const full = Math.round(s.avg);
  return (
    <View style={{ flex: 1, backgroundColor: C.violet }}>
      <Blob size={w} color={C.lilac} style={{ right: -w * 0.45, top: -w * 0.2 }} />
      <View style={PAD}>
        <T style={eyebrow(C.lavender)} d={200}>Customers rated you</T>
        <T style={h(w * 0.36)} d={400} from="zoom">{avg.toFixed(1)}</T>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Animated.View key={i} entering={ZoomIn.delay(800 + i * 150).springify().damping(9)}>
              <Star size={w * 0.1} color={i < full ? C.gold : "rgba(255,255,255,0.3)"} fill={i < full ? C.gold : "rgba(255,255,255,0.3)"} strokeWidth={0} />
            </Animated.View>
          ))}
        </View>
        <T style={[b(16), { marginTop: 14 }]} d={1700}>
          from {s.count.toLocaleString("en-NG")} review{s.count === 1 ? "" : "s"}
          {s.fiveStar > 0 ? ` · ${s.fiveStar.toLocaleString("en-NG")} five-star` : ""}
        </T>
        {s.quote ? (
          <Animated.View entering={FadeInUp.delay(2500).duration(700)} style={{ marginTop: 28, backgroundColor: "rgba(255,255,255,0.13)", borderRadius: 20, padding: 22 }}>
            <Text style={[h(40, C.gold), { position: "absolute", top: -14, left: 18 }]}>&ldquo;</Text>
            <Text style={{ fontFamily: DISPLAY, fontSize: 19, lineHeight: 25, color: "#fff" }}>{s.quote.comment}</Text>
            <Text style={[b(13, "#fff", 0.75), { marginTop: 10 }]}>— {s.quote.name}</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

function Rank({ s, w }: SlideProps<"rank">) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Animated.View entering={FadeIn.delay(300).duration(1200)} style={{ position: "absolute", left: -w * 0.4, top: "12%" }}>
        <Spin duration={40000} style={{ width: w * 1.8, height: w * 1.8, alignItems: "center", justifyContent: "center" }}>
          {Array.from({ length: 18 }, (_, i) => (
            <View key={i} style={{ position: "absolute", width: w * 0.08, height: w * 1.8, backgroundColor: "rgba(255,198,41,0.08)", transform: [{ rotate: `${i * 20}deg` }] }} />
          ))}
        </Spin>
      </Animated.View>
      <View style={[PAD, { alignItems: "center" }]}>
        <T style={h(34)} d={200}>You&rsquo;re in the</T>
        <T style={h(w * 0.3, C.gold)} d={700} from="zoom">top {s.topPercent}%</T>
        <T style={h(34)} d={1400}>of kitchens on</T>
        <T style={h(34)} d={1600}>Kitchyn.</T>
        <T style={[b(16, "#fff", 0.8), { marginTop: 20, textAlign: "center" }]} d={2500}>Ranked #{s.rank} of {s.total} by orders. Elite company.</T>
      </View>
    </View>
  );
}

function Fulfilment({ s, w, paused }: SlideProps<"fulfilment">) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Animated.View entering={FadeInDown.delay(200).duration(900)} style={{ flex: Math.max(s.deliveryPct, 25), backgroundColor: C.grape, justifyContent: "flex-end", padding: 28 }}>
        <T style={[eyebrow(C.lavender), { position: "absolute", top: 120, left: 28 }]} d={300} from="fade">How they got their food</T>
        <Animated.View entering={ZoomIn.delay(1100).springify()}><Bike size={w * 0.11} color={C.gold} strokeWidth={2.2} /></Animated.View>
        <T style={h(w * 0.2)} d={1300}><Count value={s.deliveryPct} delay={1300} paused={paused} />%</T>
        <T style={b(16)} d={1500}>delivered · {s.delivery.toLocaleString("en-NG")} orders</T>
      </Animated.View>
      <Animated.View entering={FadeInUp.delay(400).duration(900)} style={{ flex: Math.max(s.pickupPct, 25), backgroundColor: C.gold, justifyContent: "flex-end", padding: 28, paddingBottom: 48 }}>
        <Animated.View entering={ZoomIn.delay(1500).springify()}><ShoppingBag size={w * 0.11} color={C.ink} strokeWidth={2.2} /></Animated.View>
        <T style={h(w * 0.2, C.ink)} d={1700}><Count value={s.pickupPct} delay={1700} paused={paused} />%</T>
        <T style={b(16, C.ink)} d={1900}>picked up · {s.pickup.toLocaleString("en-NG")} orders</T>
      </Animated.View>
    </View>
  );
}

function Summary({ s, w, onReplay }: SlideProps<"summary"> & { onReplay: () => void }) {
  async function share() {
    const lines = s.stats.map((st) => `${st.label}: ${st.value}`).join(" · ");
    const extra = s.topDish ? `\nTop dish: ${s.topDish}` : "";
    try {
      await Share.share({ message: `My Kitchyn ${s.periodLabel} for ${s.restaurantName} 🎉\n${lines}${extra}\n#KitchynWrapped` });
      capture("wrapped_shared", { platform: "mobile" });
    } catch {
      // cancelled
    }
  }
  return (
    <LinearGradient colors={[C.plum, C.night]} style={{ flex: 1 }}>
      <View style={[PAD, { justifyContent: "space-between", paddingTop: 110 }]}>
        <Animated.View entering={FadeInUp.delay(200).springify().damping(12)} style={{ borderRadius: 26, overflow: "hidden" }}>
          <LinearGradient colors={[C.violet, C.plum, C.ink]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ padding: 24 }}>
            <Blob size={w * 0.6} color={C.coral} style={{ right: -w * 0.25, top: -w * 0.25 }} />
            <Text style={eyebrow(C.gold)}>{s.periodLabel}</Text>
            <Text style={[h(fit(s.restaurantName, 34, w, 1.3)), { marginTop: 6 }]}>{s.restaurantName}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 22, rowGap: 18 }}>
              {s.stats.map((st, i) => (
                <Animated.View key={st.label} entering={FadeInDown.delay(700 + i * 120)} style={{ width: "50%" }}>
                  <Text style={{ fontFamily: DISPLAY, fontSize: 11, letterSpacing: 1.6, color: "rgba(255,255,255,0.6)" }}>{st.label.toUpperCase()}</Text>
                  <Text style={h(32)}>{st.value}</Text>
                </Animated.View>
              ))}
            </View>
            {s.topDish || s.busiestDay ? (
              <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.15)", gap: 6 }}>
                {s.topDish ? <Text style={b(14)}><Text style={{ opacity: 0.6 }}>Top dish </Text><Text style={{ fontFamily: DISPLAY }}>{s.topDish}</Text></Text> : null}
                {s.busiestDay ? <Text style={b(14)}><Text style={{ opacity: 0.6 }}>Big day </Text><Text style={{ fontFamily: DISPLAY }}>{s.busiestDay}s</Text></Text> : null}
              </View>
            ) : null}
            <Image source={logo} style={{ height: 18, width: 54, marginTop: 22, tintColor: "#fff" }} resizeMode="contain" />
          </LinearGradient>
        </Animated.View>
        <Animated.View entering={FadeInUp.delay(1600)} style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
          <Pressable onPress={share} style={{ flex: 1, height: 52, borderRadius: 999, backgroundColor: C.gold, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Share2 size={18} color={C.ink} strokeWidth={2.6} />
            <Text style={{ fontFamily: DISPLAY, fontSize: 16, color: C.ink }}>Share</Text>
          </Pressable>
          <Pressable onPress={onReplay} accessibilityLabel="Watch again" style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
            <RotateCcw size={20} color="#fff" strokeWidth={2.6} />
          </Pressable>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

function SlideView({ slide, w, paused, onReplay }: { slide: WrappedSlide; w: number; paused: boolean; onReplay: () => void }) {
  const p = { w, paused };
  switch (slide.kind) {
    case "intro": return <Intro s={slide} {...p} />;
    case "origin": return <Origin s={slide} {...p} />;
    case "orders": return <Orders s={slide} {...p} />;
    case "revenue": return <Revenue s={slide} {...p} />;
    case "topDish": return <TopDish s={slide} {...p} />;
    case "topFive": return <TopFive s={slide} {...p} />;
    case "customers": return <Customers s={slide} {...p} />;
    case "fan": return <Fan s={slide} {...p} />;
    case "peak": return <Peak s={slide} {...p} />;
    case "bestDay": return <BestDay s={slide} {...p} />;
    case "reviews": return <Reviews s={slide} {...p} />;
    case "rank": return <Rank s={slide} {...p} />;
    case "fulfilment": return <Fulfilment s={slide} {...p} />;
    case "summary": return <Summary s={slide} {...p} onReplay={onReplay} />;
  }
}

// ── Player ─────────────────────────────────────────────────────────────────

function Bar({ state, progress, light }: { state: "done" | "active" | "todo"; progress: SharedValue<number>; light: boolean }) {
  const a = useAnimatedStyle(() => ({ width: `${state === "done" ? 100 : state === "active" ? progress.value * 100 : 0}%` }));
  return (
    <View style={{ flex: 1, height: 3, borderRadius: 99, backgroundColor: light ? "rgba(16,0,43,0.18)" : "rgba(255,255,255,0.3)", overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", backgroundColor: light ? C.ink : "#fff", borderRadius: 99 }, a]} />
    </View>
  );
}

export function WrappedStory({ edition, visible, onClose }: { edition: WrappedEdition; visible: boolean; onClose: () => void }) {
  const slides = useMemo(() => buildWrappedSlides(edition.stats), [edition]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [held, setHeld] = useState(false);
  const [userPause, setUserPause] = useState(false);
  const paused = held || userPause;
  const progress = useSharedValue(0);
  const elapsed = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const slide = slides[index];
  const meta = META[slide.kind];
  const isLast = index === slides.length - 1;

  const go = useCallback(
    (n: number) => {
      if (n < 0 || n >= slides.length) return;
      elapsed.current = 0;
      progress.value = 0;
      setIndex(n);
    },
    [slides.length, progress]
  );

  useEffect(() => {
    if (!visible) return;
    capture("wrapped_opened", { period_key: edition.period_key, platform: "mobile" });
    setIndex(0);
    elapsed.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      if (!pausedRef.current && meta.duration > 0) elapsed.current += now - last;
      last = now;
      const p = meta.duration > 0 ? Math.min(1, elapsed.current / meta.duration) : 1;
      progress.value = p;
      if (meta.duration > 0 && p >= 1 && index < slides.length - 1) {
        go(index + 1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, index, run, meta.duration, slides.length, go, progress]);

  const replay = useCallback(() => {
    elapsed.current = 0;
    setIndex(0);
    setRun((r) => r + 1);
  }, []);

  const color = meta.light ? C.ink : "#fff";

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: C.night }}>
        <Pressable
          style={{ flex: 1 }}
          delayLongPress={180}
          onLongPress={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
          onPress={(e) => {
            if (e.nativeEvent.locationX < width * 0.3) {
              if (index === 0) replay();
              else go(index - 1);
            } else if (!isLast) go(index + 1);
          }}
        >
          <Animated.View key={`${run}-${index}`} entering={FadeIn.duration(320)} style={{ flex: 1 }}>
            <SlideView slide={slide} w={width} paused={paused} onReplay={replay} />
          </Animated.View>
        </Pressable>

        {/* Chrome */}
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 10, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: "row", gap: 4, opacity: paused ? 0.4 : 1 }}>
            {slides.map((_, i) => (
              <Bar key={i} state={i < index ? "done" : i === index ? "active" : "todo"} progress={progress} light={meta.light} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
            <Image source={logo} style={{ height: 15, width: 46, tintColor: color }} resizeMode="contain" />
            <Text style={{ fontFamily: BODY, fontSize: 11, color, opacity: 0.75 }}>
              {edition.scope === "all_time" ? "All-time Wrapped" : `${wrappedPeriodLabel(edition.period_key)} Wrapped`}
            </Text>
            <View style={{ flex: 1 }} />
            {!isLast ? (
              <Pressable hitSlop={10} onPress={() => setUserPause((p) => !p)} style={{ padding: 6 }}>
                {userPause ? <Play size={18} color={color} fill={color} /> : <Pause size={18} color={color} fill={color} />}
              </Pressable>
            ) : null}
            <Pressable hitSlop={10} onPress={onClose} style={{ padding: 6 }} accessibilityLabel="Close">
              <X size={22} color={color} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
