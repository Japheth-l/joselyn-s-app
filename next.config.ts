import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow photo uploads (up to 3 MB each) through server actions.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
