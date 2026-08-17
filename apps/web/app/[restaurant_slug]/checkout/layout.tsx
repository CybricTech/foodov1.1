import type { Metadata } from "next";

/**
 * Keeps checkout out of search results.
 *
 * robots.txt already disallows crawling it, but a disallow only stops the fetch —
 * a URL that gets linked or shared can still be indexed, URL-only, with no
 * description. `noindex` is the directive that actually removes it. Belt and
 * braces, because a checkout page in the results for a merchant's brand name is
 * a dead end for the searcher and dilutes the storefront that should rank.
 *
 * This exists as a layout because the page itself is a client component and so
 * cannot export metadata.
 */
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
