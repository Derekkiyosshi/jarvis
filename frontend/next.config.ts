import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
