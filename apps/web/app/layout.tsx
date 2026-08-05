import type { Metadata, Viewport } from "next";
import * as Sentry from "@sentry/nextjs";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const viewport: Viewport = {
  viewportFit: "cover",
};

export function generateMetadata(): Metadata {
  return {
    title: "Kitchyn — White-label Food Ordering Platform",
    description: "Launch your own branded food ordering platform. Direct orders, zero commissions, full control.",
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        {/* Vercel Web Analytics — page views and visitors, server-side sampled
            and cookieless. Sits alongside PostHog (product analytics, in
            Providers) rather than replacing it: this one survives the ad
            blockers that eat posthog.com requests, so it is the honest
            denominator for traffic. */}
        <Analytics />
      </body>
    </html>
  );
}
