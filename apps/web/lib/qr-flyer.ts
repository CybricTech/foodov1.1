/**
 * Helpers for the merchant QR flyer (admin → print).
 *
 * The flyer is a faithful reproduction of the "Skip the Queue" print template,
 * recoloured to each merchant's brand colour and pointed at their storefront.
 */

/**
 * Storefront domain/host helpers live in lib/site.ts — the same module the
 * canonical URLs in page metadata and the sitemap are built from, so the URL a
 * customer scans off a flyer is by construction the URL Google indexes.
 * Re-exported here because the flyer components have always imported them from
 * this module.
 */
export { STOREFRONT_DOMAIN, storefrontHost } from "./site";
import { storefrontHost } from "./site";

/** Absolute URL the QR code encodes. UTM tags let PostHog attribute QR-driven visits. */
export function storefrontQrUrl(slug: string): string {
  return `https://${storefrontHost(slug)}?utm_source=qr_flyer&utm_medium=print`;
}

const KITCHYN_PURPLE = "#3C096C";

/** Normalise a stored brand colour to a `#rrggbb` hex, falling back to Kitchyn purple. */
export function sanitizeBrandColor(color: string | null | undefined): string {
  if (!color) return KITCHYN_PURPLE;
  let c = color.trim().toLowerCase();
  if (!c.startsWith("#")) c = `#${c}`;
  // Expand shorthand #abc -> #aabbcc
  if (/^#[0-9a-f]{3}$/.test(c)) {
    c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(c) ? c : KITCHYN_PURPLE;
}

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastWithWhite(rgb: [number, number, number]): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

/**
 * Returns a print-safe version of the brand colour: the colour unchanged when it
 * already contrasts enough with white, otherwise darkened along its own hue until
 * it does. Keeps light brand colours legible and, critically, keeps the QR code
 * scannable. Most brand colours pass untouched.
 */
export function readableBrandColor(brandHex: string, minContrast = 3.5): string {
  let rgb = parseHex(brandHex);
  for (let i = 0; i < 24 && contrastWithWhite(rgb) < minContrast; i++) {
    rgb = [rgb[0] * 0.86, rgb[1] * 0.86, rgb[2] * 0.86];
  }
  return toHex(rgb[0], rgb[1], rgb[2]);
}

/**
 * Recolour a QR SVG's modules. The QR is generated once (server-side) with black
 * modules; the customiser swaps in the live brand colour client-side without
 * re-running the QR encoder. Matches both `stroke="#000000"` (path form) and
 * `fill="#000000"` (rect form) so it works whatever shape qrcode emits.
 */
export function colorizeQrSvg(svg: string, darkColor: string): string {
  return svg
    .replace(/stroke="#000000"/gi, `stroke="${darkColor}"`)
    .replace(/(<path[^>]*?)fill="#000000"/gi, `$1fill="${darkColor}"`);
}
