import type { Metadata } from "next";

/**
 * Keeps the order funnel out of search results — covers track, pending,
 * /[order_id] and success/[order_id].
 *
 * These pages are per-customer and per-order: they have no value to a searcher,
 * and an indexed order URL is a privacy problem as much as an SEO one. Exists as
 * a layout because every page under here is a client component (except the
 * success page, which is force-dynamic) and so cannot export metadata itself.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
