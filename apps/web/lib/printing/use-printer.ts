"use client";

import { useSyncExternalStore } from "react";
import { printEngine } from "./print-engine";

/** Subscribe a component to the print engine's state. */
export function usePrinter() {
  return useSyncExternalStore(
    printEngine.subscribe,
    printEngine.getSnapshot,
    printEngine.getSnapshot
  );
}

export { printEngine };
