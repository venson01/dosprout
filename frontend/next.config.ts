import type { NextConfig } from "next";

// Where the backend runs when you develop on your own computer.
const LOCAL_BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // The browser calls /api/... on the website's own address. Locally, forward those
  // calls to the backend. On Vercel (VERCEL is set there), vercel.json routes /api to
  // the backend service before Next.js sees the request, so nothing is needed.
  async rewrites() {
    if (process.env.VERCEL) return [];
    return [{ source: "/api/:path*", destination: `${LOCAL_BACKEND_URL}/api/:path*` }];
  },
  turbopack: {
    // The repo root has its own package-lock.json (for running both apps together),
    // so tell Next.js that the frontend folder is the project root.
    root: __dirname,
  },
};

export default nextConfig;
