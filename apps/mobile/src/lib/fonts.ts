/**
 * Brand typography for the Kitchyn Merchant app.
 *
 * The web app uses Geist for body/UI text and Poppins / Plus Jakarta Sans for
 * display headings (see `apps/web/app/layout.tsx` + `tailwind.config.ts`). React
 * Native does NOT synthesise weights from a single font file — every weight is a
 * separate family (e.g. `Geist_700Bold`). So we:
 *
 *   1. Load every weight we need with `useFonts` (see `useBrandFonts`).
 *   2. Patch the default `Text` / `TextInput` render ONCE at startup so the
 *      correct `fontFamily` is injected based on the element's resolved
 *      `fontWeight`. This applies the brand font globally while respecting each
 *      screen's existing inline `fontWeight`, so we don't have to edit ~25
 *      screens.
 *
 * Body font: **Geist** — `@expo-google-fonts/geist` exists and bundles the
 * actual .ttf files, so we match the web app exactly (Geist), rather than
 * falling back to Plus Jakarta Sans. Plus Jakarta Sans is still loaded because
 * it is part of the web display stack and kept available for headings.
 *
 * Display font: **Poppins** — used for the big bold titles (the web display
 * family). Headings in the app are expressed via heavy `fontWeight` (700/800);
 * those map to the Poppins family below so titles read as Poppins, while normal
 * UI text reads as Geist.
 */
import { Text, TextInput, type TextStyle } from "react-native";

import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
} from "@expo-google-fonts/geist";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

/**
 * Resolved native family names, grouped by role. These are the strings RN's
 * font system looks up — they MUST match the keys passed to `useFonts`.
 */
export const fonts = {
  /** Body / UI — Geist (matches the web `sans` family). */
  body: {
    regular: "Geist_400Regular",
    medium: "Geist_500Medium",
    semibold: "Geist_600SemiBold",
    bold: "Geist_700Bold",
    extrabold: "Geist_800ExtraBold",
  },
  /** Display / headings — Poppins (matches the web display family). */
  display: {
    regular: "Poppins_400Regular",
    medium: "Poppins_500Medium",
    semibold: "Poppins_600SemiBold",
    bold: "Poppins_700Bold",
    extrabold: "Poppins_800ExtraBold",
  },
  /** Plus Jakarta Sans — secondary display family from the web stack. */
  jakarta: {
    regular: "PlusJakartaSans_400Regular",
    medium: "PlusJakartaSans_500Medium",
    semibold: "PlusJakartaSans_600SemiBold",
    bold: "PlusJakartaSans_700Bold",
    extrabold: "PlusJakartaSans_800ExtraBold",
  },
} as const;

/**
 * The exact font asset map handed to `useFonts`. Every family name referenced
 * above (for any role) must be present here so the lookup succeeds.
 */
const fontAssets = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

/**
 * Loads all brand font weights. Returns `[loaded, error]`. The root layout
 * gates the branded splash on `loaded` so there's no flash of system-font text
 * that later restyles.
 */
export function useBrandFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts(fontAssets);
  return [loaded, error ?? null];
}

/**
 * Normalises a RN `fontWeight` (number | string | 'bold' | 'normal') to one of
 * our family buckets. RN inline styles in this app use '400'|'500'|'600'|'700'
 * |'800'. We bucket by numeric weight:
 *   ≤400 → regular, 500 → medium, 600 → semibold, 700 → bold, ≥800 → extrabold.
 */
function bucketForWeight(
  weight: TextStyle["fontWeight"]
): keyof (typeof fonts)["body"] {
  if (weight === "bold") return "bold";
  if (weight == null || weight === "normal") return "regular";

  const n =
    typeof weight === "number" ? weight : parseInt(String(weight), 10);
  if (Number.isNaN(n)) return "regular";

  if (n <= 400) return "regular";
  if (n <= 500) return "medium";
  if (n <= 600) return "semibold";
  if (n <= 700) return "bold";
  return "extrabold";
}

/**
 * Picks the brand `fontFamily` for a given flattened style. Headings (weight
 * ≥700) render in the Poppins display family; everything else renders in Geist.
 * If the style already sets a `fontFamily` (e.g. an icon font), we leave it
 * alone.
 */
function familyForStyle(style: TextStyle): string | undefined {
  if (style.fontFamily) return undefined; // caller already chose a family
  const bucket = bucketForWeight(style.fontWeight);
  const useDisplay = bucket === "bold" || bucket === "extrabold";
  return useDisplay ? fonts.display[bucket] : fonts.body[bucket];
}

/**
 * Flattens a (possibly array / nested / falsy) RN style prop into a single
 * object so we can read `fontWeight` / `fontFamily`. Guards against undefined
 * and arrays so the patch never throws.
 */
function flattenStyle(style: unknown): TextStyle {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<TextStyle>((acc, s) => {
      return { ...acc, ...flattenStyle(s) };
    }, {});
  }
  if (typeof style === "object") return style as TextStyle;
  return {};
}

let patched = false;

/**
 * Patches `Text.render` and `TextInput.render` once so the brand `fontFamily`
 * is injected based on each element's resolved `fontWeight`. Inline styles still
 * win for everything except `fontFamily` (which the app never sets), because we
 * prepend our family as the FIRST entry of the style array — later (caller)
 * styles override it, but they don't set fontFamily, so ours stands.
 *
 * Idempotent + crash-guarded: safe to call at every module eval / fast-refresh.
 */
export function applyBrandFontPatch(): void {
  if (patched) return;
  patched = true;

  type RenderComponent = {
    render?: (...args: unknown[]) => unknown;
  };

  const patch = (Component: unknown) => {
    const comp = Component as RenderComponent;
    const original = comp.render;
    if (typeof original !== "function") return;

    comp.render = function patchedRender(...args: unknown[]) {
      // The element being rendered is the first arg (props) on forwardRef
      // render fns: render(props, ref). We mutate a shallow copy of props so we
      // don't accidentally share style references.
      const [props, ref] = args as [
        { style?: unknown } | undefined,
        unknown,
      ];

      let family: string | undefined;
      try {
        family = familyForStyle(flattenStyle(props?.style));
      } catch {
        family = undefined;
      }

      if (!family || !props) {
        return original.apply(this, args as never);
      }

      const nextProps = {
        ...props,
        // Our family goes FIRST so any caller-provided style still overrides
        // it; callers never set fontFamily, so the brand family wins in
        // practice while their fontWeight/size/etc. are preserved.
        style: [{ fontFamily: family }, props.style],
      };

      return original.apply(this, [nextProps, ref] as never);
    };
  };

  patch(Text);
  patch(TextInput);
}
