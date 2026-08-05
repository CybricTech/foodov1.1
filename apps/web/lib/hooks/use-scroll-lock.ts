"use client";

import { useEffect } from "react";

/**
 * Freeze the page behind an open sheet without losing the reader's place.
 *
 * `overflow: hidden` on <body> is ignored by iOS Safari, which is most of our
 * storefront traffic, so the page keeps scrolling behind the sheet. The working
 * technique is `position: fixed` with a negative `top`, which needs the scroll
 * offset saved on the way in and restored on the way out.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * ------------------------------
 * The menu item sheet did all of the above in one effect keyed on the selected
 * item, with the offset in a ref and the restore in the cleanup:
 *
 *     useEffect(() => {
 *       if (item) { saved.current = window.scrollY; ...lock... }
 *       return () => { ...unlock...; window.scrollTo({ top: saved.current }); }
 *     }, [item]);
 *
 * The cleanup is registered whether or not the sheet is open, and React runs it
 * before the next effect — so OPENING the sheet first ran the previous cleanup,
 * which scrolled to `saved.current`, still 0 from the initial mount. The page
 * jumped to the top underneath the sheet, the new effect then saved that 0 as
 * the restore position, and closing the sheet appeared to scroll the customer
 * back to the top of the menu. A customer browsing a long menu lost their place
 * on every single item they tapped.
 *
 * Two things here make that shape impossible rather than merely fixed:
 *
 *   1. an early `return` when closed, so no cleanup is registered and a stale
 *      restore cannot fire on the way in
 *   2. the offset lives in the effect's own closure, not a ref, so the cleanup
 *      can only ever restore the value its own lock captured
 *
 * The lock is reference-counted at module scope because sheets can overlap (an
 * item sheet with the cart sheet over it). Without the count, the inner sheet
 * closing would clear the outer sheet's lock and let the page scroll away
 * beneath it; with it, only the last one out restores.
 */
let lockCount = 0;
let lockedScrollY = 0;

export function useScrollLock(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;

    // Only the outermost sheet takes the reading — a sheet opening on top of
    // another must not re-read a scroll position the body no longer has.
    if (lockCount === 0) {
      lockedScrollY = window.scrollY;
      const { style } = document.body;
      style.position = "fixed";
      style.top = `-${lockedScrollY}px`;
      style.left = "0";
      style.right = "0";
      // Fixed positioning collapses the body to its content width; pinning it
      // stops a narrow page reflowing the moment the sheet opens.
      style.width = "100%";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount > 0) return;

      const { style } = document.body;
      style.position = "";
      style.top = "";
      style.left = "";
      style.right = "";
      style.width = "";
      // Instant, not smooth: this is undoing a jump the customer never saw, and
      // animating it would look like the page moving on its own.
      window.scrollTo({ top: lockedScrollY, behavior: "instant" });
    };
  }, [isOpen]);
}
