import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["apify-client", "proxy-agent", "@google/generative-ai"],
  outputFileTracingIncludes: {
    "/api/digest/run": ["./node_modules/proxy-agent/**/*"],
  },
};

export default nextConfig;
