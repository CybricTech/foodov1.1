/**
 * Image helpers for the storefront.
 *
 * Background: storefront images are rendered with `unoptimized` on <Image> to
 * stay off Vercel's image-optimization quota. To keep them small we instead:
 *   1. Resize/compress in the browser before upload (compressImage), and
 *   2. Request a per-context size from Supabase's own image CDN (transformImage).
 *
 * Supabase image transformations require the Pro plan (the project is on Pro).
 * A public storage URL looks like:
 *   {base}/storage/v1/object/public/menu-images/{path}
 * and the transform endpoint is:
 *   {base}/storage/v1/render/image/public/menu-images/{path}?width=…&quality=…
 */

const PUBLIC_SEGMENT = "/storage/v1/object/public/";
const RENDER_SEGMENT = "/storage/v1/render/image/public/";

export interface TransformOpts {
  /**
   * Target box dimensions in CSS px — pass the size of the element the image
   * renders into. Both are required: Supabase's transform endpoint does NOT
   * preserve aspect ratio from a single dimension (width-only returns the
   * original height, which distorts/over-crops the image). The helper applies
   * a 2× factor for retina screens.
   */
  width: number;
  height: number;
  /** 1–100. Defaults to 70 for thumbnails; callers can lower for tiny images. */
  quality?: number;
  /**
   * "cover" (default) center-crops to fill width×height — matches CSS
   * object-cover, which is how every thumbnail/banner renders. Use "contain"
   * for the lightbox where the whole image must stay visible (object-contain).
   */
  resize?: "cover" | "contain";
}

/**
 * Rewrites a Supabase public storage URL to its image-transform equivalent,
 * sized + cropped for the display box. Returns the original URL unchanged if it
 * isn't a Supabase public URL (defensive — e.g. external or already-transformed
 * URLs), so it's always safe to wrap a src in this.
 */
export function transformImage(
  url: string | null | undefined,
  { width, height, quality = 70, resize = "cover" }: TransformOpts
): string {
  if (!url || !url.includes(PUBLIC_SEGMENT)) return url ?? "";

  // 2× for retina/high-DPI screens — the dominant case on phones.
  const w = Math.round(width * 2);
  const h = Math.round(height * 2);

  const transformed = url.replace(PUBLIC_SEGMENT, RENDER_SEGMENT);
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${w}&height=${h}&quality=${quality}&resize=${resize}`;
}

export interface CompressOpts {
  /** Longest edge of the output, in px. Image is scaled down to fit, never up. */
  maxEdge?: number;
  /** 0–1 webp quality. */
  quality?: number;
}

/**
 * Resizes + re-encodes an image File to webp in the browser before upload.
 * Keeps stored originals small so even the full-size lightbox/banner stays
 * reasonable. Falls back to the original file if the browser can't decode it
 * or webp isn't supported.
 */
export async function compressImage(
  file: File,
  { maxEdge = 1600, quality = 0.8 }: CompressOpts = {}
): Promise<File> {
  // Skip non-raster types (svg, gif) — re-encoding would lose animation/vectors.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  try {
    // `from-image` applies EXIF orientation so phone photos aren't re-encoded
    // sideways (createImageBitmap ignores orientation otherwise).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const outW = Math.round(width * scale);
    const outH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality)
    );
    if (!blob) return file;

    // If compression didn't actually help, keep the original.
    if (blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
