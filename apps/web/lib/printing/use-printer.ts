"use client";

import { useSyncExternalStore } from "react";
import { printEngine } from "./print-engine";
import type { PrinterSnapshot } from "./print-engine";

// Real SSR always sees `supported: false` (no navigator.usb on the server).
// But printEngine is a singleton whose snapshot is computed eagerly the
// moment its module loads — in the browser that happens synchronously,
// before hydration, so `getSnapshot()` already reflects the real WebUSB
// support (true in Chrome/Edge). Passing that same live function as
// `getServerSnapshot` made React's hydration pass compare "true" against
// the server's "false" HTML and throw. A frozen, always-false snapshot here
// guarantees the first client render matches the server exactly; the real
// state takes over via the live subscription right after hydration commits.
const SERVER_SNAPSHOT: PrinterSnapshot = {
  supported: false,
  status: "disconnected",
  deviceName: null,
  queued: 0,
  printing: false,
  lastError: null,
  autoPrint: true,
  poweredBy: true,
};

/** Subscribe a component to the print engine's state. */
export function usePrinter() {
  return useSyncExternalStore(
    printEngine.subscribe,
    printEngine.getSnapshot,
    () => SERVER_SNAPSHOT
  );
}

export { printEngine };
