"use client";

// Receipt-printer status pill for the frontline view. Always visible so staff
// can see at a glance whether the printer is live, and tap to connect (the first
// USB grant needs a click). Also hosts the test print + auto-print / branding
// toggles.

import { useState } from "react";
import { Printer, PrinterCheck, AlertTriangle, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@foodo/ui";
import { usePrinter, printEngine } from "@/lib/printing/use-printer";

export function PrinterIndicator() {
  const p = usePrinter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // WebUSB is desktop-Chrome/Edge only; on unsupported browsers, stay quiet
  // rather than nag (e.g. a manager checking orders on their phone).
  if (!p.supported) return null;

  const connected = p.status === "connected";
  const connecting = p.status === "connecting";

  const dot = connected ? "bg-emerald-500" : connecting ? "bg-amber-500" : "bg-red-500";
  const label = connecting
    ? "Connecting…"
    : connected
      ? p.queued > 0 ? `Printer · ${p.queued} queued` : "Printer ready"
      : "Printer offline";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (connected ? setOpen((o) => !o) : run(() => printEngine.connect()))}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
          connected
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
        )}
        title={p.deviceName ?? undefined}
      >
        {connecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : connected ? (
          <PrinterCheck className="h-4 w-4" />
        ) : (
          <Printer className="h-4 w-4" />
        )}
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span>{connected ? label : "Connect printer"}</span>
        {connected && <ChevronDown className="h-3.5 w-3.5 opacity-60" />}
      </button>

      {p.lastError && !connected && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700 shadow-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{p.lastError}</span>
          </div>
        </div>
      )}

      {connected && open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-black-200 bg-white p-3 text-sm shadow-lg">
          <div className="mb-2 truncate text-xs text-black-500">{p.deviceName}</div>

          <label className="flex items-center justify-between py-1.5">
            <span>Auto-print new orders</span>
            <input
              type="checkbox"
              checked={p.autoPrint}
              onChange={(e) => printEngine.setSettings({ autoPrint: e.target.checked })}
              className="h-4 w-4 accent-purple-600"
            />
          </label>
          <label className="flex items-center justify-between py-1.5">
            <span>&ldquo;powered by Kitchyn&rdquo; footer</span>
            <input
              type="checkbox"
              checked={p.poweredBy}
              onChange={(e) => printEngine.setSettings({ poweredBy: e.target.checked })}
              className="h-4 w-4 accent-purple-600"
            />
          </label>

          <div className="mt-2 flex gap-2 border-t border-black-100 pt-2">
            <button
              disabled={busy}
              onClick={() => run(() => printEngine.testPrint())}
              className="flex-1 rounded-md bg-black-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Test print
            </button>
            <button
              onClick={() => { printEngine.disconnect(); setOpen(false); }}
              className="rounded-md border border-black-200 px-3 py-1.5 text-xs font-medium text-black-600 hover:bg-black-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
