"use client";

import { useEffect, useState } from "react";

/**
 * Colours the iOS status-bar strip to match the hero photo underneath it.
 *
 * Safari 26 ignores theme-color and tints the status bar from a fixed,
 * full-width element at the top edge (see lib/storefront/hero-edge-color.ts),
 * so this is that element. It must stay `position: fixed` with its own
 * background-color — Safari skips absolute children and pseudo-elements.
 *
 * Phones only, and only at the top of the page: once the visitor scrolls,
 * Safari shows real page pixels behind the bar and the strip would just cover
 * content.
 */
export function StatusBarTint({ color }: { color: string }) {
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!atTop) return null;

  return (
    <div
      aria-hidden="true"
      className="md:hidden pointer-events-none fixed inset-x-0 top-0 z-30"
      style={{
        // Safari reads background-color only when the element is >10px deep.
        height: "max(env(safe-area-inset-top), 12px)",
        backgroundColor: color,
        // Soft lower edge so the flat band melts into the photo.
        maskImage: "linear-gradient(to bottom, #000 55%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)",
      }}
    />
  );
}
