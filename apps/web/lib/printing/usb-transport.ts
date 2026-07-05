// Thin WebUSB transport for ESC/POS printers. Holds no React state — the
// print-engine store owns lifecycle. Desktop Chrome/Edge over HTTPS only.
//
// Windows note: the printer's interface must be bound to WinUSB (via Zadig) or
// claimInterface() throws "Access denied". That's a one-time per-machine setup.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Minimal WebUSB surface — the full types aren't in the project's TS DOM lib,
// and we only touch a handful of members.
interface UsbDeviceLike {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string;
  configuration: any;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: string; bytesWritten: number }>;
}

export interface OpenPrinter {
  device: UsbDeviceLike;
  endpoint: number;
  name: string;
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

function deviceLabel(d: UsbDeviceLike): string {
  return d.productName || `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`;
}

async function openAndClaim(device: UsbDeviceLike): Promise<OpenPrinter> {
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  for (const iface of device.configuration!.interfaces) {
    const alt = iface.alternates[0];
    const out = alt.endpoints.find((e: any) => e.direction === "out" && e.type === "bulk");
    if (out) {
      // Some platforms leave a kernel driver attached; ignore if not detachable.
      try { await device.claimInterface(iface.interfaceNumber); }
      catch (e: any) {
        throw new Error(
          /access|claim/i.test(e?.message ?? "")
            ? "Windows is holding the printer — run Zadig and set its driver to WinUSB, then reconnect."
            : `Could not claim the printer: ${e?.message ?? e}`
        );
      }
      return { device, endpoint: out.endpointNumber, name: deviceLabel(device) };
    }
  }
  throw new Error("This device has no printable (bulk OUT) endpoint.");
}

/** Prompt the user to pick a printer (requires a click). Opens and claims it. */
export async function requestPrinter(): Promise<OpenPrinter> {
  if (!isWebUsbSupported()) throw new Error("WebUSB isn't available in this browser.");
  const device = await (navigator as any).usb.requestDevice({ filters: [] });
  return openAndClaim(device);
}

/** Reconnect to a previously-granted printer with no prompt (page reload, etc). */
export async function reopenGrantedPrinter(): Promise<OpenPrinter | null> {
  if (!isWebUsbSupported()) return null;
  const devices: UsbDeviceLike[] = await (navigator as any).usb.getDevices();
  for (const device of devices) {
    try {
      const opened = await openAndClaim(device);
      return opened;
    } catch {
      // try the next granted device
    }
  }
  return null;
}

/** Send raw bytes in chunks so large payloads (logos) don't overrun the printer. */
export async function sendToPrinter(printer: OpenPrinter, bytes: Uint8Array): Promise<void> {
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const res = await printer.device.transferOut(printer.endpoint, bytes.slice(i, i + CHUNK));
    if (res.status !== "ok") throw new Error(`printer transfer ${res.status}`);
  }
}

export function onUsbDisconnect(cb: (device: UsbDeviceLike) => void): () => void {
  if (!isWebUsbSupported()) return () => {};
  const handler = (e: any) => cb(e.device);
  (navigator as any).usb.addEventListener("disconnect", handler);
  return () => (navigator as any).usb.removeEventListener("disconnect", handler);
}
