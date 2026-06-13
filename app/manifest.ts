import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: getEnv().publicAppName,
    short_name: "NCStore",
    description: "넥스트챌린지스쿨 매점 키오스크",
    start_url: "/",
    display: "standalone",
    background_color: "#eff6ff",
    theme_color: "#eff6ff",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
