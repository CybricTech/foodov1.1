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
  },
};

export default bundleAnalyzer(nextConfig);
