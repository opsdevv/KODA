import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cider/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3847/api/:path*",
      },
    ];
  },
};

export default nextConfig;
