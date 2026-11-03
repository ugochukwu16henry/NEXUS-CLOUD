import type { MetadataRoute } from "next";

/** Makes Nexus Cloud installable on phones and computers (Add to Home Screen / Install app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nexus Cloud",
    short_name: "Nexus",
    description: "Personal AI-powered software engineering cloud",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070b14",
    theme_color: "#070b14",
    categories: ["developer", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Projects",
        url: "/projects",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      { name: "Agents", url: "/agents", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
