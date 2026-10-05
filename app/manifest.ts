import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MHNow 配裝工具",
    short_name: "MHNow 配裝",
    description: "Monster Hunter Now 裝備與素材規劃工具",
    start_url: ".",
    scope: ".",
    display: "standalone",
    background_color: "#17110f",
    theme_color: "#17110f",
    orientation: "portrait-primary",
    lang: "zh-Hant",
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
