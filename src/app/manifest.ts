import type { MetadataRoute } from "next";

// Lets people install TailorConnect on their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TailorConnect Ghana",
    short_name: "TailorConnect",
    description: "Find a tailor near you, choose your style and fabric, and get it sewn and delivered.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#0d7352",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
