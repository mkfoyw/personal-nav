import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(process.env.SITES_EXPORT === "1" || process.env.GITHUB_PAGES === "1"
    ? { output: "export" }
    : {}),
  ...(process.env.GITHUB_PAGES === "1"
    ? { basePath: process.env.PAGES_BASE_PATH ?? "/personal-nav", trailingSlash: true }
    : {}),
};

export default nextConfig;
