// @ts-check
import withBundleAnalyzer from "@next/bundle-analyzer";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "kitchyn.app",
        "dashboard.kitchyn.app",
        "admin.kitchyn.app",
        "staging.kitchyn.app",
        "*.kitchyn.app",
      ],
    },
    // Disable the Router Cache for dynamic routes so admin/dashboard pages
    // never serve stale RSC payloads when navigating via <Link>. Without this,
    // Next.js keeps every visited route's payload in memory for the lifetime
    // of the tab session — meaning users see snapshots that can be hours or
    // days old until they hard-reload. Storefront menu pages (static) keep a
    // small 30s window for snappy customer browsing.
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default bundleAnalyzer(nextConfig);
