"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@foodo/ui";

export interface FocalPoint {
  x: number;
  y: number;
}

interface FocalPointPickerProps {
  imageUrl: string;
  mobileValue: FocalPoint;
  desktopValue: FocalPoint;
  onMobileChange: (value: FocalPoint) => void;
  onDesktopChange: (value: FocalPoint) => void;
}

/**
 * Drag-to-set focal point for the storefront hero banner. Mirrors the actual
 * crop shapes (tall on mobile, wide on desktop) so what the merchant centers
 * here matches what object-position renders on the live storefront — see
 * .storefront-hero-img in globals.css (093).
 */
export function FocalPointPicker({
  imageUrl,
  mobileValue,
  desktopValue,
  onMobileChange,
  onDesktopChange,
}: FocalPointPickerProps) {
  const [tab, setTab] = useState<"mobile" | "desktop">("mobile");
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const value = tab === "mobile" ? mobileValue : desktopValue;
  const onChange = tab === "mobile" ? onMobileChange : onDesktopChange;

  const updateFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
      onChange({ x: Math.round(x), y: Math.round(y) });
    },
    [onChange]
  );

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPoint(e.clientX, e.clientY);
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    updateFromPoint(e.clientX, e.clientY);
  }
  function handlePointerUp() {
    draggingRef.current = false;
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-black-200 p-0.5 bg-black-50">
        <button
          type="button"
          onClick={() => setTab("mobile")}
          className={tabCls(tab === "mobile")}
        >
          Mobile
        </button>
        <button
          type="button"
          onClick={() => setTab("desktop")}
          className={tabCls(tab === "desktop")}
        >
          Desktop
        </button>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative overflow-hidden rounded-xl border border-black-100 bg-black-100 cursor-crosshair select-none touch-none mx-auto"
        style={{
          aspectRatio: tab === "mobile" ? "9 / 13" : "20 / 9",
          maxWidth: tab === "mobile" ? 240 : "100%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Hero focal point preview"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: `${value.x}% ${value.y}%` }}
        />
        <div
          className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow-lg pointer-events-none"
          style={{ left: `${value.x}%`, top: `${value.y}%`, backgroundColor: "rgba(0,0,0,0.35)" }}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-black-400">
          Drag to set what stays centered on {tab}.
        </p>
        <button
          type="button"
          onClick={() => onChange({ x: 50, y: 50 })}
          className="text-xs font-medium text-purple-600 hover:underline"
        >
          Reset to center
        </button>
      </div>
    </div>
  );
}

function tabCls(active: boolean) {
  return cn(
    "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
    active ? "bg-white text-black-900 shadow-sm" : "text-black-400 hover:text-black-600"
  );
}
