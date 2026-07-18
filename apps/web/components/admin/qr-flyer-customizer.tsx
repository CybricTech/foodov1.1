"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Upload, RotateCcw, Trash2, ImageIcon } from "lucide-react";
import {
  colorizeQrSvg,
  readableBrandColor,
  sanitizeBrandColor,
} from "@/lib/qr-flyer";
import { QrFlyerSheet, DEFAULT_TAGLINE } from "./qr-flyer-sheet";

type Settings = {
  brandColor: string;
  logoScale: number;
  headlineScale: number;
  taglineSize: number;
  tagline: string;
  logoMode: "default" | "none";
};

function defaultSettings(brandColor: string): Settings {
  return {
    brandColor,
    logoScale: 1,
    headlineScale: 1,
    taglineSize: 4.75,
    tagline: DEFAULT_TAGLINE,
    logoMode: "default",
  };
}

export function QrFlyerCustomizer({
  merchantId,
  merchantName,
  defaultLogoUrl,
  defaultBrandColor,
  storefrontHost,
  baseQrSvg,
}: {
  merchantId: string;
  merchantName: string;
  defaultLogoUrl: string | null;
  defaultBrandColor: string;
  storefrontHost: string;
  baseQrSvg: string;
}) {
  const storageKey = `qr-flyer:${merchantId}`;
  const [settings, setSettings] = useState<Settings>(() => defaultSettings(defaultBrandColor));
  // Uploaded logo is session-only (not persisted — data URLs can be large).
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate persisted settings after mount (keeps SSR markup === first client render).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSettings((s) => ({ ...s, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed storage */
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [settings, storageKey]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const brandInk = useMemo(
    () => readableBrandColor(sanitizeBrandColor(settings.brandColor)),
    [settings.brandColor]
  );
  const coloredQr = useMemo(() => colorizeQrSvg(baseQrSvg, brandInk), [baseQrSvg, brandInk]);

  const logoSrc = customLogo ?? (settings.logoMode === "none" ? null : defaultLogoUrl);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file (PNG, JPG or SVG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomLogo(reader.result as string);
      set("logoMode", "default");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function resetAll() {
    setSettings(defaultSettings(defaultBrandColor));
    setCustomLogo(null);
  }

  return (
    <>
      {/* Top bar */}
      <div className="qf-controls flex items-center justify-between gap-4 flex-wrap mb-5">
        <div>
          <Link
            href={`/admin/merchants/${merchantId}`}
            className="inline-flex items-center gap-1 text-sm text-black-500 hover:text-black-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {merchantName}
          </Link>
          <h1 className="mt-1 text-xl font-extrabold text-black-900">QR flyer</h1>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-4 py-2.5 transition-colors"
        >
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="flex gap-6 items-start flex-wrap-reverse">
        {/* Controls */}
        <div className="qf-controls w-80 shrink-0 space-y-5 rounded-2xl border border-black-200 bg-white p-5">
          {/* Brand colour */}
          <Field label="Brand colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={sanitizeBrandColor(settings.brandColor)}
                onChange={(e) => set("brandColor", e.target.value)}
                className="h-9 w-12 rounded-lg border border-black-200 bg-white p-0.5 cursor-pointer"
                aria-label="Brand colour"
              />
              <input
                type="text"
                value={settings.brandColor}
                onChange={(e) => set("brandColor", e.target.value)}
                spellCheck={false}
                className="flex-1 rounded-lg border border-black-200 px-3 py-1.5 text-sm font-mono uppercase"
              />
            </div>
            {brandInk.toLowerCase() !== sanitizeBrandColor(settings.brandColor).toLowerCase() && (
              <p className="mt-1 text-xs text-black-400">
                Darkened to{" "}
                <span className="font-mono" style={{ color: brandInk }}>
                  {brandInk}
                </span>{" "}
                on the flyer so the QR stays scannable.
              </p>
            )}
          </Field>

          {/* Logo */}
          <Field label="Logo">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black-200 hover:border-purple-400 hover:text-purple-600 px-3 py-1.5 text-sm font-medium transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomLogo(null);
                  set("logoMode", "default");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black-200 hover:border-purple-400 hover:text-purple-600 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
                disabled={!customLogo && settings.logoMode === "default"}
                title="Use the merchant's saved logo"
              >
                <ImageIcon className="w-3.5 h-3.5" /> Default
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomLogo(null);
                  set("logoMode", "none");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black-200 hover:border-cinnabar-400 hover:text-cinnabar-500 px-2.5 py-1.5 text-sm font-medium transition-colors"
                title="Remove the logo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onUpload}
                className="hidden"
              />
            </div>
            <Slider
              label="Size"
              min={0.5}
              max={1.6}
              step={0.02}
              value={settings.logoScale}
              onChange={(v) => set("logoScale", v)}
              format={(v) => `${Math.round(v * 100)}%`}
              disabled={!logoSrc}
            />
          </Field>

          {/* Headline size */}
          <Field label="Headline size">
            <Slider
              min={0.8}
              max={1.2}
              step={0.01}
              value={settings.headlineScale}
              onChange={(v) => set("headlineScale", v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Field>

          {/* Tagline */}
          <Field label="Tagline">
            <textarea
              value={settings.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              rows={3}
              spellCheck={false}
              className="w-full rounded-lg border border-black-200 px-3 py-2 text-sm resize-none leading-snug"
            />
            <p className="mt-1 text-xs text-black-400">
              New line = line break. Wrap text in **stars** to bold it.
            </p>
            <div className="mt-2">
              <Slider
                label="Size"
                min={3.8}
                max={5.6}
                step={0.05}
                value={settings.taglineSize}
                onChange={(v) => set("taglineSize", v)}
                format={(v) => `${v.toFixed(1)}mm`}
              />
            </div>
          </Field>

          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1.5 text-sm text-black-500 hover:text-black-900 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to template
          </button>
        </div>

        {/* Preview */}
        <div className="qf-preview flex-1 min-w-0 overflow-auto">
          <QrFlyerSheet
            merchantName={merchantName}
            logoSrc={logoSrc}
            brandInk={brandInk}
            storefrontHost={storefrontHost}
            qrSvg={coloredQr}
            tagline={settings.tagline}
            custom={{
              logoScale: settings.logoScale,
              headlineScale: settings.headlineScale,
              taglineSize: settings.taglineSize,
            }}
          />
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-black-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  disabled,
}: {
  label?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex items-center justify-between text-xs text-black-500 mb-1">
        <span>{label}</span>
        <span className="font-mono">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-purple-600 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}
