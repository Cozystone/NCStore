import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "absolute.maeil.com" },
      { protocol: "https", hostname: "img06.weeecdn.com" },
      { protocol: "https", hostname: "img1.daumcdn.net" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "eggfac.com" },
      { protocol: "https", hostname: "jnjint.kr" },
    ],
  },
};

export default nextConfig;
