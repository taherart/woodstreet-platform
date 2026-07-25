import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/woodstreet',
  serverExternalPackages: ['better-sqlite3', '@modelcontextprotocol/sdk'],
};

export default nextConfig;
