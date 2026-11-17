import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The 3D engine is created once in an effect; Strict Mode's double-mount would build the whole city twice in dev.
  reactStrictMode: false,
};

export default nextConfig;
