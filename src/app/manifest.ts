import type { MetadataRoute } from "next";

// Lets people install Ntoma on their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ntoma",
    short_name: "Ntoma",
    description: "Find a tailor near you, choose your style and fabric, and get it sewn and delivered.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#14382a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
