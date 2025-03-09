import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve 'fs', 'net', 'dns', 'tls', etc. on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        dns: false,
        tls: false,
        pg: false,
        'pg-native': false,
        'pg-pool': false,
      };
    }
    return config;
  },
};

export default nextConfig;
