/**
 * Guards against open-redirect payloads in a `?redirect=` query param before
 * it's ever used in `window.location.href`. Only a same-origin path (starts
 * with a single "/") is allowed — "//evil.com" and "/\evil.com" are both
 * protocol-relative URLs that browsers treat as external, so both are
 * rejected in favor of `fallback`.
 */
export function safeRedirect(path: string | null | undefined, fallback: string): string {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return fallback;
  }
  return path;
}
