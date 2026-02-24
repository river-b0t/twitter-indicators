import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["apify-client", "proxy-agent", "@google/generative-ai"],
  outputFileTracingIncludes: {
    "/api/digest/run": [
      "./node_modules/proxy-agent/**/*",
      "./node_modules/agent-base/**/*",
      "./node_modules/http-proxy-agent/**/*",
      "./node_modules/https-proxy-agent/**/*",
      "./node_modules/socks-proxy-agent/**/*",
      "./node_modules/socks/**/*",
      "./node_modules/pac-proxy-agent/**/*",
      "./node_modules/pac-resolver/**/*",
      "./node_modules/get-uri/**/*",
      "./node_modules/degenerator/**/*",
      "./node_modules/@tootallnate/quickjs-emscripten/**/*",
      "./node_modules/smart-buffer/**/*",
      "./node_modules/ip-address/**/*",
      "./node_modules/netmask/**/*",
      "./node_modules/basic-ftp/**/*",
      "./node_modules/data-uri-to-buffer/**/*",
    ],
  },
};

export default nextConfig;
