import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kitchyn",
    short_name: "Kitchyn",
    description: "Order directly from your favourite restaurants",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2D6A4F",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
