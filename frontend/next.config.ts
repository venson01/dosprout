import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The repo root has its own package-lock.json (for running both apps together),
    // so tell Next.js that the frontend folder is the project root.
    root: __dirname,
  },
};

export default nextConfig;
