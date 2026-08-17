import type { Metadata, Viewport } from "next";
import * as Sentry from "@sentry/nextjs";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { apexOrigin } from "@/lib/site";

export const viewport: Viewport = {
  viewportFit: "cover",
};

const TITLE = "Kitchyn — Online Ordering for Restaurants in Nigeria";
const DESCRIPTION =
  "Your own branded storefront for direct online orders. Built for independent restaurants in Nigeria — 1% per order, no aggregator commissions.";

export function generateMetadata(): Metadata {
  return {
    /**
     * Required for `alternates.canonical` and relative OG image URLs to resolve
     * to anything at all — without it Next emits them relative to localhost.
     *
     * This is the APEX base. Storefront routes override it per merchant in
     * app/[restaurant_slug]/layout.tsx so their canonical URLs land on the
     * merchant's own subdomain. That override is the whole mechanism by which
     * kitchyn.app/<slug> and <slug>.kitchyn.app/<slug> consolidate onto
     * <slug>.kitchyn.app — see lib/site.ts.
     */
    metadataBase: new URL(apexOrigin()),
    title: {
      default: TITLE,
      // Storefront routes replace this template with the merchant's own.
      template: "%s | Kitchyn",
    },
    description: DESCRIPTION,
    applicationName: "Kitchyn",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "Kitchyn",
      locale: "en_NG",
      url: "/",
      title: TITLE,
      description: DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
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
    <html lang="en-NG">
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
