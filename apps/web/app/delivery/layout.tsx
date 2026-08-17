import type { Metadata } from "next";

/**
 * Keeps rider capability links out of search results.
 *
 * `/delivery/[share_link_token]` is authorised by an unguessable token in the URL
 * itself. Indexing one would publish that token — the URL *is* the credential —
 * so this is a privacy control before it is an SEO one.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
