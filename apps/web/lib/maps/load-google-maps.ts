/**
 * Loads the Google Maps JavaScript API in the browser, once per page.
 *
 * The key is NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY — a separate, referrer-locked
 * browser key. GOOGLE_MAPS_API_KEY is the server key behind distance pricing
 * and must never be shipped to a client, which is why this doesn't fall back
 * to it.
 *
 * This is Google's documented script-tag bootstrap (`loading=async` + a
 * callback, then `importLibrary`) rather than a loader package: it is the same
 * thing @googlemaps/js-api-loader does under the hood, it adds nothing to the
 * bundle, and only one screen needs a map.
 *
 * The script is only requested when a picker actually opens, so pages that
 * merely contain one don't pay the ~200 KB download or a billable map load.
 */

export const GOOGLE_MAPS_BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";

const CALLBACK = "__kitchynGoogleMapsReady";
const LOAD_TIMEOUT_MS = 15_000;

type MapsWindow = Window & {
  [CALLBACK]?: () => void;
  /** Google calls this when the key is rejected (bad key, referrer, or API not enabled). */
  gm_authFailure?: () => void;
};

let loading: Promise<void> | null = null;
let authFailed = false;
const authFailureListeners = new Set<() => void>();

/**
 * Resolves once `google.maps.importLibrary` is usable. Rejects if there is no
 * key, the script can't be fetched (offline, blocked by CSP or an ad blocker),
 * or it takes too long — callers fall back to the street list in every case.
 *
 * A rejected key is different: the script loads fine and Google reports the
 * failure later through gm_authFailure, after the map has already rendered an
 * error tile. Use onGoogleMapsAuthFailure to hear about that.
 */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Not in a browser"));
  if (!GOOGLE_MAPS_BROWSER_KEY) return Promise.reject(new Error("No Google Maps browser key"));
  if (authFailed) return Promise.reject(new Error("Google Maps rejected the key"));
  if (typeof google !== "undefined" && typeof google.maps?.importLibrary === "function") {
    return Promise.resolve();
  }
  if (loading) return loading;

  const w = window as MapsWindow;

  if (!w.gm_authFailure) {
    w.gm_authFailure = () => {
      authFailed = true;
      authFailureListeners.forEach((fn) => fn());
    };
  }

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(new Error("Google Maps took too long to load")), LOAD_TIMEOUT_MS);

    function fail(err: Error) {
      window.clearTimeout(timer);
      delete w[CALLBACK];
      script.remove();
      // Allow a later attempt (e.g. after the connection comes back) to retry.
      loading = null;
      reject(err);
    }

    w[CALLBACK] = () => {
      window.clearTimeout(timer);
      delete w[CALLBACK];
      resolve();
    };

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_BROWSER_KEY,
      v: "weekly",
      loading: "async",
      callback: CALLBACK,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => fail(new Error("Could not load Google Maps"));
    document.head.appendChild(script);
  });

  return loading;
}

/** Subscribes to Google rejecting the key. Returns an unsubscribe function. */
export function onGoogleMapsAuthFailure(fn: () => void): () => void {
  if (authFailed) {
    fn();
    return () => {};
  }
  authFailureListeners.add(fn);
  return () => {
    authFailureListeners.delete(fn);
  };
}
