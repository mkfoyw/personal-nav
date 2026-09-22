import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(process.env.SITES_EXPORT === "1" ? { output: "export" } : {}),
};

export default nextConfig;
