"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface StorefrontSplashProps {
  logoUrl: string | null;
  brandColor: string;
  restaurantName: string;
}

// SVG circle circumference for r=44: 2π×44 ≈ 276.5
const CIRCUMFERENCE = 276.5;
// Show ~80% of the arc, leave a 20% gap so it looks like a flowing tail
const DASH = CIRCUMFERENCE * 0.8;
const GAP = CIRCUMFERENCE - DASH;

export function StorefrontSplash({ logoUrl, brandColor, restaurantName }: StorefrontSplashProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Start fade-out after 1.4s, unmount after fade completes
    const fadeTimer = setTimeout(() => setFading(true), 1400);
    const removeTimer = setTimeout(() => setVisible(false), 1700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-white flex flex-col items-center justify-center gap-4"
      style={{
        opacity: fading ? 0 : 1,
        transition: "opacity 0.3s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {/* Ring + logo */}
      <div className="relative flex items-center justify-center">
        {/* Spinning SVG ring */}
        <svg
          width="112"
          height="112"
          viewBox="0 0 112 112"
          className="animate-spin"
          style={{ animationDuration: "1.1s", animationTimingFunction: "linear" }}
        >
          <circle
            cx="56"
            cy="56"
            r="44"
            fill="none"
            stroke={brandColor}
            strokeWidth="3.5"
            strokeDasharray={`${DASH} ${GAP}`}
            strokeLinecap="round"
          />
        </svg>

        {/* Logo centred inside the ring */}
        <div className="absolute w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm"
          style={{ borderColor: `${brandColor}22` }}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={restaurantName}
              fill
              unoptimized
              className="object-cover"
              sizes="64px"
              priority
            />
          ) : (
            // Fallback: first letter of restaurant name in brand color
            <div
              className="w-full h-full flex items-center justify-center text-white text-2xl font-bold"
              style={{ backgroundColor: brandColor }}
            >
              {restaurantName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
