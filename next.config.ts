import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "webdiorama-proxy.david-liger-pro.workers.dev",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
