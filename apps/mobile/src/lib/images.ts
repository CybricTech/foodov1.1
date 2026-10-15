/**
 * Sized image URLs for Supabase Storage photos.
 *
 * Menu photos are stored at up to 1600px (some originals are ~1.9 MB). Showing
 * them in a 48px thumbnail meant downloading and decoding the full file for
 * every row, which is slow on mobile data and makes long lists stutter as each
 * huge bitmap is decoded. Measured on live storefront photos: six thumbnails
 * went from 2.66 MB to 33 KB through the transform endpoint.
 *
 * Same Supabase image CDN the web storefront already uses (apps/web/lib/
 * images.ts transformImage), so this adds no new service. Transforms are billed
 * per source image, not per size variant.
 */
import { PixelRatio } from "react-native";

const PUBLIC_SEGMENT = "/storage/v1/object/public/";
const RENDER_SEGMENT = "/storage/v1/render/image/public/";

/**
 * Rewrites a Supabase public storage URL to a transform sized for a
 * `width` × `height` (dp) box at this device's pixel density, center-cropped
 * like resizeMode="cover". Anything that isn't a Supabase public URL (a local
 * file:// preview right after picking a photo, an external link) is returned
 * unchanged, so it's always safe to wrap a source in this.
 */
export function sizedImageUrl(
  url: string | null | undefined,
  width: number,
  height: number,
  { quality = 70, resize = "cover" }: { quality?: number; resize?: "cover" | "contain" } = {}
): string {
  if (!url || !url.includes(PUBLIC_SEGMENT)) return url ?? "";
  // Real device density, capped at 3x (beyond that the eye can't tell, and
  // the bytes roughly double).
  const scale = Math.min(PixelRatio.get(), 3);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const transformed = url.replace(PUBLIC_SEGMENT, RENDER_SEGMENT);
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${w}&height=${h}&quality=${quality}&resize=${resize}`;
}
