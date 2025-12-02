import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  
  // Headers configuratie voor iframe embedding
  async headers() {
    return [
      {
        // Pas headers toe op alle routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'ALLOW-FROM https://www.itsdoneservices.nl',
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://www.itsdoneservices.nl https://itsdoneservices.nl",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
