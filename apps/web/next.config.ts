import type { NextConfig } from "next";

const API_PORT = process.env.API_PORT || '4200';
const apiBaseUrl = process.env.INTERNAL_API_URL || `http://localhost:${API_PORT}`;

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: API_PORT,
        pathname: '/api/v1/storage/cards/**',
      },
      {
        protocol: 'https',
        hostname: 'www.pokemon-card.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ptcg002.tcghk.trade',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBaseUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
