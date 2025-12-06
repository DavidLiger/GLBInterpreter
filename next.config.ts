import withSerwistInit from '@serwist/next';
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "webdiorama-proxy.david-liger-pro.workers.dev",
        pathname: "/**",
      },
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // ✅ AJOUTER : Force webpack (nécessaire pour Serwist)
  webpack: (config, { isServer }) => {
    // Configuration webpack nécessaire pour Serwist
    return config;
  },
};

export default withSerwist(nextConfig);