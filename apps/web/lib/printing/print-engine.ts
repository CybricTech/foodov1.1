// Print engine — a framework-agnostic singleton store driving the receipt
// printer. Owns: WebUSB connection, a PERSISTED offline queue, a printed-id
// dedupe set, and per-merchant settings. Exposes a useSyncExternalStore-shaped
// API (subscribe/getSnapshot). The React layer (use-printer.ts) and the
// frontline runner sit on top.
//
// Design goals:
//  • Orders enqueue the instant they arrive; the engine prints them serially.
//  • Survives reloads/offline: queue + printed-ids persist in localStorage, so
//    orders received while the printer was unplugged (or the device was offline
//    and caught up on reconnect) still print exactly once.
//  • Never double-prints: every order id goes into a persisted printed set.

import { buildReceiptBytes, type ReceiptOrder } from "./escpos";
import { logoUrlToRaster } from "./logo";
import {
  isWebUsbSupported,
  requestPrinter,
  reopenGrantedPrinter,
  sendToPrinter,
  onUsbDisconnect,
  type OpenPrinter,
} from "./usb-transport";

export interface PrinterSnapshot {
  supported: boolean;
  status: "disconnected" | "connecting" | "connected";
  deviceName: string | null;
  queued: number;
  printing: boolean;
  lastError: string | null;
  autoPrint: boolean;
  poweredBy: boolean;
}

interface Settings { autoPrint: boolean; poweredBy: boolean }

const PRINTED_CAP = 2000;

class PrintEngine {
  private printer: OpenPrinter | null = null;
  private queue: ReceiptOrder[] = [];
  private printed = new Set<string>();
  private settings: Settings = { autoPrint: true, poweredBy: true };

  private rid: string | null = null;
  private restaurantName = "";
  private logoUrl: string | null = null;

  private draining = false;
  private connecting = false;
  private lastError: string | null = null;
  private listeners = new Set<() => void>();
  private snapshot: PrinterSnapshot = this.computeSnapshot();
  private usbUnsub: (() => void) | null = null;

  // ── External-store API ────────────────────────────────────────────────────
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): PrinterSnapshot => this.snapshot;

  private computeSnapshot(): PrinterSnapshot {
    return {
      supported: isWebUsbSupported(),
      status: this.connecting ? "connecting" : this.printer ? "connected" : "disconnected",
      deviceName: this.printer?.name ?? null,
      queued: this.queue.length,
      printing: this.draining,
      lastError: this.lastError,
      autoPrint: this.settings.autoPrint,
      poweredBy: this.settings.poweredBy,
    };
  }
  private emit() {
    this.snapshot = this.computeSnapshot();
    this.listeners.forEach((l) => l());
  }

  // ── Persistence (per restaurant) ──────────────────────────────────────────
  private key(kind: "queue" | "printed" | "settings") {
    return `kitchyn:printer:${kind}:${this.rid ?? "none"}`;
  }
  private load() {
    if (typeof window === "undefined") return;
    try {
      this.queue = JSON.parse(localStorage.getItem(this.key("queue")) || "[]");
      this.printed = new Set<string>(JSON.parse(localStorage.getItem(this.key("printed")) || "[]"));
      const s = localStorage.getItem(this.key("settings"));
      if (s) this.settings = { ...this.settings, ...JSON.parse(s) };
    } catch { /* corrupt storage — start clean */ }
  }
  private persistQueue() {
    try { localStorage.setItem(this.key("queue"), JSON.stringify(this.queue)); } catch {}
  }
  private persistPrinted() {
    try {
      const arr = [...this.printed].slice(-PRINTED_CAP);
      this.printed = new Set(arr);
      localStorage.setItem(this.key("printed"), JSON.stringify(arr));
    } catch {}
  }
  private persistSettings() {
    try { localStorage.setItem(this.key("settings"), JSON.stringify(this.settings)); } catch {}
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Bind to a restaurant; load its persisted state; attempt silent reconnect. */
  configure(ctx: { restaurantId: string; restaurantName: string; logoUrl: string | null }) {
    const changed = ctx.restaurantId !== this.rid;
    this.rid = ctx.restaurantId;
    this.restaurantName = ctx.restaurantName;
    this.logoUrl = ctx.logoUrl;
    if (changed) {
      this.load();
      if (!this.usbUnsub) {
        this.usbUnsub = onUsbDisconnect(() => {
          this.printer = null;
          this.emit();
        });
      }
      void this.reconnectSilently();
      this.emit();
    }
  }

  setSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    this.persistSettings();
    this.emit();
  }

  /** Reconnect to an already-granted printer without a prompt (after reload/replug). */
  async reconnectSilently(): Promise<void> {
    if (this.printer || !isWebUsbSupported()) return;
    const opened = await reopenGrantedPrinter().catch(() => null);
    if (opened) {
      this.printer = opened;
      this.lastError = null;
      this.emit();
      void this.drain();
    }
  }

  /** User-gesture connect (shows the chooser). Use from a click handler. */
  async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true; this.lastError = null; this.emit();
    try {
      this.printer = await requestPrinter();
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    } finally {
      this.connecting = false;
      this.emit();
      void this.drain();
    }
  }

  disconnect() {
    try { this.printer?.device.close(); } catch {}
    this.printer = null;
    this.emit();
  }

  // ── Queue ─────────────────────────────────────────────────────────────────
  /** Add an order to the print queue (skips anything already printed/queued). */
  enqueue(order: ReceiptOrder) {
    if (!this.settings.autoPrint) return;
    if (this.printed.has(order.orderNumber) || this.queue.some((o) => o.orderNumber === order.orderNumber)) return;
    this.queue.push(order);
    this.persistQueue();
    this.emit();
    void this.drain();
  }

  /** Print one order now, on demand (manual print/reprint) — bypasses dedupe. */
  async printNow(order: ReceiptOrder): Promise<void> {
    await this.reconnectSilently();
    if (!this.printer) { this.lastError = "No printer connected."; this.emit(); return; }
    await this.send(order);
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    if (!this.printer) { await this.reconnectSilently(); if (!this.printer) return; }
    this.draining = true; this.emit();
    try {
      while (this.queue.length && this.printer) {
        const order = this.queue[0];
        try {
          await this.send(order);
        } catch (e) {
          // Printer error (likely unplugged) — keep the order queued and stop;
          // we'll resume on reconnect/replug or the next enqueue.
          this.lastError = e instanceof Error ? e.message : String(e);
          this.printer = null;
          break;
        }
        this.printed.add(order.orderNumber);
        this.queue.shift();
        this.persistPrinted();
        this.persistQueue();
        this.emit();
      }
    } finally {
      this.draining = false;
      this.emit();
    }
  }

  private async send(order: ReceiptOrder): Promise<void> {
    if (!this.printer) throw new Error("printer not connected");
    const logoBytes = await logoUrlToRaster(this.logoUrl);
    const bytes = buildReceiptBytes(order, {
      restaurantName: this.restaurantName,
      logoBytes,
      poweredBy: this.settings.poweredBy,
    });
    await sendToPrinter(this.printer, bytes);
  }

  async testPrint(): Promise<void> {
    await this.printNow({
      orderNumber: "TEST",
      createdAt: new Date().toISOString(),
      fulfillmentType: "delivery",
      customerName: "Test Customer",
      customerPhone: "0800 000 0000",
      deliveryAddress: "12 Test Street, Lagos",
      specialInstructions: "This is a test print",
      items: [
        { name: "Jollof Rice", quantity: 1, lineTotalKobo: 250000, options: [{ optionName: "Extras", choices: [{ choiceName: "Extra chicken" }] }] },
        { name: "Coke", quantity: 2, lineTotalKobo: 60000, options: null },
      ],
      subtotalKobo: 310000, deliveryFeeKobo: 120000, vatKobo: 0, serviceFeeKobo: 0, discountKobo: 0, totalKobo: 430000,
    });
  }
}

export const printEngine = new PrintEngine();
