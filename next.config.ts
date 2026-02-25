import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["agent-twitter-client", "@google/generative-ai"],
  outputFileTracingIncludes: {
    "/api/digest/run": ["./node_modules/agent-twitter-client/**/*"],
  },
};

export default nextConfig;
