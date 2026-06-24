import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      { source: "/flights",    destination: "/", permanent: false },
      { source: "/hotels",     destination: "/", permanent: false },
      { source: "/activities", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
