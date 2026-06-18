// ESC/POS receipt builder for 58mm thermal printers (384 dots ≈ 32 chars/line).
// Pure byte generation — no DOM, no transport. The logo (if any) is passed in
// already converted to raster bytes by ./logo.ts.

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  lineTotalKobo: number;
  options?: Array<{
    optionName: string;
    choices: Array<{ choiceName: string; priceModifierKobo?: number; quantity?: number }>;
  }> | null;
}

export interface ReceiptOrder {
  orderNumber: string;
  createdAt: string;
  fulfillmentType: "delivery" | "pickup";
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  specialInstructions: string | null;
  items: ReceiptLineItem[];
  subtotalKobo: number;
  deliveryFeeKobo: number;
  vatKobo: number;
  serviceFeeKobo: number;
  discountKobo: number;
  totalKobo: number;
}

export interface ReceiptOptions {
  restaurantName: string;
  /** Pre-rendered ESC/POS raster bytes for the merchant logo (see ./logo.ts). */
  logoBytes?: Uint8Array | null;
  /** Print a small "powered by Kitchyn" footer. Off for full white-label. */
  poweredBy?: boolean;
  /** Characters per line. 32 for 58mm (default), 48 for 80mm. */
  width?: number;
}

const ESC = 0x1b;
const GS = 0x1d;

// The ₦ glyph isn't in these printers' character set, so spell it "NGN".
function naira(kobo: number): string {
  return (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

/** Left text + right-aligned amount on one `width`-char line; wraps the label. */
function row(left: string, right: string, width: number): string {
  const space = width - right.length;
  if (left.length <= space - 1) {
    return left + " ".repeat(width - left.length - right.length) + right + "\n";
  }
  // Label too long — wrap it, put the amount on the last line if it fits.
  const lines = wrap(left, width);
  const last = lines[lines.length - 1];
  if (last.length <= space - 1) {
    lines[lines.length - 1] = last + " ".repeat(width - last.length - right.length) + right;
    return lines.join("\n") + "\n";
  }
  return lines.join("\n") + "\n" + " ".repeat(width - right.length) + right + "\n";
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length <= width) {
      cur += (cur ? " " : "") + w;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > width ? w.slice(0, width) : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-NG", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function buildReceiptBytes(order: ReceiptOrder, opts: ReceiptOptions): Uint8Array {
  const W = opts.width ?? 32;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const raw = (...b: number[]) => chunks.push(Uint8Array.from(b));
  const text = (s: string) => chunks.push(enc.encode(s));
  const rule = () => text("-".repeat(W) + "\n");

  raw(ESC, 0x40); // initialise

  // ── Header: merchant logo + name (no Kitchyn branding) ──
  if (opts.logoBytes && opts.logoBytes.length) {
    raw(ESC, 0x61, 0x01); // center
    chunks.push(opts.logoBytes);
    raw(0x0a);
  }
  raw(ESC, 0x61, 0x01); raw(ESC, 0x21, 0x08); // center + emphasized
  text(opts.restaurantName + "\n");
  raw(ESC, 0x21, 0x00); raw(ESC, 0x61, 0x00); // normal + left

  rule();
  text(row(`Order #${order.orderNumber}`, formatTime(order.createdAt), W));
  text(`Type: ${order.fulfillmentType === "delivery" ? "DELIVERY" : "PICKUP"}\n`);
  rule();

  // ── Receiver block ──
  raw(ESC, 0x21, 0x08);
  text(`${order.fulfillmentType === "delivery" ? "DELIVER TO" : "FOR"}:\n`);
  raw(ESC, 0x21, 0x00);
  if (order.customerName) for (const l of wrap(order.customerName, W - 2)) text("  " + l + "\n");
  if (order.customerPhone) text("  " + order.customerPhone + "\n");
  if (order.fulfillmentType === "delivery" && order.deliveryAddress)
    for (const l of wrap(order.deliveryAddress, W - 2)) text("  " + l + "\n");
  if (order.specialInstructions)
    for (const l of wrap("Note: " + order.specialInstructions, W - 2)) text("  " + l + "\n");
  rule();

  // ── Items ──
  for (const item of order.items) {
    text(row(`${item.quantity}x ${item.name}`, naira(item.lineTotalKobo), W));
    for (const opt of item.options ?? []) {
      for (const c of opt.choices ?? []) {
        const qty = c.quantity && c.quantity > 1 ? `${c.quantity}x ` : "";
        for (const l of wrap(`+ ${qty}${c.choiceName}`, W - 3)) text("   " + l + "\n");
      }
    }
  }
  rule();

  // ── Totals ──
  text(row("Subtotal", naira(order.subtotalKobo), W));
  if (order.deliveryFeeKobo > 0) text(row("Delivery", naira(order.deliveryFeeKobo), W));
  if (order.vatKobo > 0) text(row("VAT", naira(order.vatKobo), W));
  if (order.serviceFeeKobo > 0) text(row("Service", naira(order.serviceFeeKobo), W));
  if (order.discountKobo > 0) text(row("Discount", "-" + naira(order.discountKobo), W));
  rule();
  raw(ESC, 0x21, 0x08);
  text(row("TOTAL", "NGN " + naira(order.totalKobo), W));
  raw(ESC, 0x21, 0x00);
  rule();

  // ── Footer ──
  if (opts.poweredBy) {
    raw(ESC, 0x61, 0x01); raw(ESC, 0x4d, 0x01); // center + small font
    text("powered by Kitchyn\n");
    raw(ESC, 0x4d, 0x00); raw(ESC, 0x61, 0x00);
  }
  raw(0x0a, 0x0a, 0x0a, 0x0a); // feed clear of the tear bar
  raw(GS, 0x56, 0x00); // full cut (ignored by cutterless printers)

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
