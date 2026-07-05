// Converts a merchant logo URL into ESC/POS raster bytes (GS v 0) for a 58mm
// printer: scale to 384px wide, center, Floyd–Steinberg dither to 1-bit.
// Browser-only (uses <canvas>). Results are cached per URL.

const PRINT_WIDTH = 384; // 58mm printable width in dots

const cache = new Map<string, Uint8Array | null>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // Supabase render/public URLs allow CORS reads
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo image failed to load"));
    img.src = url;
  });
}

/**
 * Returns ESC/POS raster bytes for the logo, or null if it can't be loaded /
 * converted (caller simply prints without a logo). Never throws.
 */
export async function logoUrlToRaster(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url) ?? null;

  try {
    const img = await loadImage(url);
    const scale = Math.min(1, PRINT_WIDTH / img.width);
    const lw = Math.max(1, Math.round(img.width * scale));
    const lh = Math.max(1, Math.round(img.height * scale));
    const W = PRINT_WIDTH;
    const H = lh;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, Math.floor((W - lw) / 2), 0, lw, lh); // center horizontally

    const pix = ctx.getImageData(0, 0, W, H).data; // throws if CORS-tainted

    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const a = pix[i * 4 + 3];
      gray[i] = a < 128 ? 255 : 0.299 * pix[i * 4] + 0.587 * pix[i * 4 + 1] + 0.114 * pix[i * 4 + 2];
    }
    // Floyd–Steinberg dither → 1 = black
    const mono = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const nv = gray[i] < 128 ? 0 : 255;
        const err = gray[i] - nv;
        mono[i] = nv === 0 ? 1 : 0;
        if (x + 1 < W) gray[i + 1] += (err * 7) / 16;
        if (y + 1 < H) {
          if (x > 0) gray[i - 1 + W] += (err * 3) / 16;
          gray[i + W] += (err * 5) / 16;
          if (x + 1 < W) gray[i + 1 + W] += (err * 1) / 16;
        }
      }
    }

    const widthBytes = W / 8;
    const data = new Uint8Array(widthBytes * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (mono[y * W + x]) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);

    const header = Uint8Array.from([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      H & 0xff, (H >> 8) & 0xff,
    ]);
    const out = new Uint8Array(header.length + data.length);
    out.set(header, 0);
    out.set(data, header.length);
    cache.set(url, out);
    return out;
  } catch (err) {
    console.warn("[printer] logo conversion failed, printing without logo:", err);
    cache.set(url, null);
    return null;
  }
}
