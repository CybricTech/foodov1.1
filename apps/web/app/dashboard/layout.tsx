import type { Metadata } from "next";

/**
 * Keeps the merchant dashboard out of search results, login page included.
 *
 * `(protected)/layout.tsx` sets a per-merchant title but nothing here was ever
 * marked noindex, so the login screen was indexable — a zero-value result that
 * competes with the storefronts we actually want ranking for a merchant's name.
 * Deeper layouts inherit this and only override the title.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
