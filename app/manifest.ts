import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Micosm Game",
    short_name: "Micosm",
    description: "围棋、五子棋与黑白棋多人对战平台。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#e8f0f7",
    theme_color: "#e8f0f7",
    orientation: "any",
    icons: [
      {
        src: "/micosm-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/micosm-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/micosm-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
