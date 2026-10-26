import "server-only";
import sharp from "sharp";
import { unstable_cache } from "next/cache";
import { responsiveSrcSet } from "@/lib/images";

/**
 * The colour of the top edge of a storefront banner, as a phone renders it.
 *
 * Why this exists: iOS paints the status-bar strip above a browser tab itself.
 * Safari 26 ignores <meta name="theme-color"> and instead samples a fixed
 * element touching the top edge (falling back to white), so the storefront hero
 * sat under a plain white bar. StatusBarTint paints a fixed strip in this colour
 * so the bar reads as a continuation of the photo.
 *
 * A browser can't read cross-origin image pixels without CORS, and the colour
 * has to be in the server HTML before Safari samples on load, so it's computed
 * here. Cached forever per (url, crop, scrim): banner uploads get a fresh
 * timestamped filename, so a new banner is a new cache key.
 */

/** One CSS/CDN cover-crop step: the box aspect ratio and object-position (0-100). */
export interface CoverCrop {
  aspect: number;
  x: number;
  y: number;
}

/** Fraction of the visible image height averaged as the "top edge". */
const EDGE_BAND = 0.04;

function coverRect(
  rect: { left: number; top: number; width: number; height: number },
  { aspect, x, y }: CoverCrop
) {
  if (rect.width / rect.height > aspect) {
    const width = rect.height * aspect;
    return { ...rect, left: rect.left + (rect.width - width) * (x / 100), width };
  }
  const height = rect.width / aspect;
  return { ...rect, top: rect.top + (rect.height - height) * (y / 100), height };
}

const hex = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

async function computeEdgeColor(
  bannerUrl: string,
  crops: CoverCrop[],
  scrimHex: string | null,
  scrimAlpha: number
): Promise<string | null> {
  // A ≤400px-wide uncropped CDN resize is plenty to average an edge band.
  const res = await fetch(responsiveSrcSet(bannerUrl, { widths: [400] }).src, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const image = sharp(Buffer.from(await res.arrayBuffer()));
  const { width = 0, height = 0 } = await image.metadata();
  if (!width || !height) return null;

  const visible = crops.reduce(coverRect, { left: 0, top: 0, width, height });
  const left = Math.floor(visible.left);
  const top = Math.floor(visible.top);
  const band = {
    left,
    top,
    width: Math.max(1, Math.min(width - left, Math.round(visible.width))),
    height: Math.max(1, Math.min(height - top, Math.round(visible.height * EDGE_BAND))),
  };

  const { channels } = await image.extract(band).stats();
  const [r, g, b] = channels.length >= 3
    ? [channels[0].mean, channels[1].mean, channels[2].mean]
    : [channels[0].mean, channels[0].mean, channels[0].mean];

  // Composite the hero's brand-colour scrim over the photo, as the page does.
  if (scrimHex && /^#[0-9a-fA-F]{6}$/.test(scrimHex)) {
    const s = [1, 3, 5].map((i) => parseInt(scrimHex.slice(i, i + 2), 16));
    const mix = (c: number, i: number) => c * (1 - scrimAlpha) + s[i] * scrimAlpha;
    return `#${hex(mix(r, 0))}${hex(mix(g, 1))}${hex(mix(b, 2))}`;
  }
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const cachedEdgeColor = unstable_cache(computeEdgeColor, ["hero-edge-color"], {
  revalidate: false,
});

/**
 * Never throws: a failed fetch/decode just means no tint (the old white bar),
 * not a broken storefront. Failures aren't cached, so the next render retries.
 */
export async function getHeroEdgeColor(
  bannerUrl: string | null | undefined,
  crops: CoverCrop[],
  scrim: { color: string | null; alpha: number }
): Promise<string | null> {
  if (!bannerUrl) return null;
  try {
    return await cachedEdgeColor(bannerUrl, crops, scrim.color, scrim.alpha);
  } catch (err) {
    console.warn("[hero-edge-color] failed", err);
    return null;
  }
}
