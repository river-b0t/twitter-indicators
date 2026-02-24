import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["apify-client", "proxy-agent", "@google/generative-ai"],
};

export default nextConfig;
