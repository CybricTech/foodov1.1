/**
 * Kitchyn Wrapped — the shareable summary image (1080×1920, story-sized).
 *
 * Drawn straight onto a canvas (no html-to-image dependency) so it's crisp and
 * identical everywhere. Uses the Web Share API with the PNG when the browser
 * supports sharing files (phones), and falls back to a download.
 */
import type { WrappedSlide } from "@foodo/utils";

type Summary = Extract<WrappedSlide, { kind: "summary" }>;

const W = 1080;
const H = 1920;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Shrink a font until `text` fits `maxWidth`. Returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, maxWidth: number) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px Poppins, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  return size;
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export async function renderShareCard(s: Summary): Promise<Blob | null> {
  try {
    await Promise.all([
      document.fonts?.load("900 120px Poppins"),
      document.fonts?.load("700 40px Poppins"),
    ]);
  } catch {
    // Fall back to system fonts.
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, "#7B2CBF");
  bg.addColorStop(0.5, "#3C096C");
  bg.addColorStop(1, "#10002B");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  blob(ctx, W * 0.95, H * 0.08, 620, "rgba(230,57,70,0.55)");
  blob(ctx, W * 0.05, H * 0.9, 640, "rgba(255,198,41,0.35)");
  blob(ctx, W * 0.2, H * 0.35, 420, "rgba(199,125,255,0.30)");

  const pad = 96;
  ctx.textBaseline = "alphabetic";

  // Logo (tinted white)
  const logo = await loadImage("/logo.png");
  if (logo) {
    const lh = 64;
    const lw = (logo.width / logo.height) * lh;
    const off = document.createElement("canvas");
    off.width = lw;
    off.height = lh;
    const o = off.getContext("2d");
    if (o) {
      o.drawImage(logo, 0, 0, lw, lh);
      o.globalCompositeOperation = "source-in";
      o.fillStyle = "#FFFFFF";
      o.fillRect(0, 0, lw, lh);
      ctx.drawImage(off, pad, 140);
    }
  }

  // Title
  ctx.fillStyle = "#FFC629";
  ctx.font = "700 40px Poppins, system-ui, sans-serif";
  ctx.fillText(s.periodLabel.toUpperCase(), pad, 400);

  ctx.fillStyle = "#FFFFFF";
  const nameSize = fitText(ctx, s.restaurantName, 900, 120, W - pad * 2);
  ctx.fillText(s.restaurantName, pad, 400 + nameSize + 20);

  // Stats grid
  const top = 760;
  const colW = (W - pad * 2) / 2;
  s.stats.forEach((st, i) => {
    const x = pad + (i % 2) * colW;
    const y = top + Math.floor(i / 2) * 280;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "700 34px Poppins, system-ui, sans-serif";
    ctx.fillText(st.label.toUpperCase(), x, y);
    ctx.fillStyle = "#FFFFFF";
    fitText(ctx, st.value, 900, 132, colW - 30);
    ctx.fillText(st.value, x, y + 140);
  });

  // Divider + highlights
  let y = top + Math.ceil(s.stats.length / 2) * 280 + 30;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(pad, y, W - pad * 2, 3);
  y += 110;
  for (const [label, value] of [
    ["Top dish", s.topDish],
    ["Big day", s.busiestDay ? `${s.busiestDay}s` : null],
  ] as const) {
    if (!value) continue;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "600 40px Poppins, system-ui, sans-serif";
    ctx.fillText(label, pad, y);
    const lw = ctx.measureText(label + "  ").width;
    ctx.fillStyle = "#FFFFFF";
    fitText(ctx, value, 800, 52, W - pad * 2 - lw);
    ctx.fillText(value, pad + lw, y);
    y += 90;
  }

  // Footer
  ctx.fillStyle = "#FFC629";
  ctx.font = "800 40px Poppins, system-ui, sans-serif";
  ctx.fillText("#KitchynWrapped", pad, H - 140);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export async function shareSummaryCard(s: Summary): Promise<"shared" | "downloaded" | "failed"> {
  const blob = await renderShareCard(s);
  if (!blob) return "failed";
  const fileName = `kitchyn-wrapped-${s.restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "My Kitchyn Wrapped" });
      return "shared";
    } catch (e) {
      // User cancelled the share sheet — that's fine, don't also download.
      if ((e as Error)?.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
