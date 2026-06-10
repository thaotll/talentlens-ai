import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy zur FastAPI (LangChain-Pipeline) auf Port 8000
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
