import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/api/v1/cards/image/**',
      },
      {
        protocol: 'https',
        hostname: 'ptcg002.tcghk.trade',
        pathname: '/api/v1/cards/image/**',
      },
      {
        protocol: 'http',
        hostname: 'ptcg002.tcghk.trade',
        pathname: '/api/v1/cards/image/**',
      },
    ],
  },
};

export default nextConfig;
