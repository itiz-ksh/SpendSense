import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output bundles only the files needed to run the server.
   * Used by Dockerfile to produce a minimal production image without
   * copying the full node_modules tree (~800 MB → ~150 MB).
   *
   * After `next build`, the self-contained server lives at:
   *   .next/standalone/server.js
   */
  output: "standalone",
};

export default nextConfig;
