import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const isDocker = !!process.env.NEXT_PUBLIC_API_BASE_URL;

const nextConfig: NextConfig = {
  // Use 'standalone' for Docker, 'export' for Electron
  output: isDocker ? "standalone" : "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: !isDocker,
  assetPrefix: isProd && !isDocker ? "./" : undefined,

  // Proxy API requests to backend in Docker deployment
  async rewrites() {
    // Only use rewrites in Docker mode
    if (!isDocker) {
      return [];
    }

    const backendUrl = process.env.BACKEND_URL || "http://backend:8000";

    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
