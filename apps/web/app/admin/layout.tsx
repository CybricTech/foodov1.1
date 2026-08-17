import type { Metadata } from "next";

/**
 * Keeps the super-admin console out of search results, login page included.
 * See app/dashboard/layout.tsx for the reasoning.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
