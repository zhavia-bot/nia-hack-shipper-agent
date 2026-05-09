import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  experimental: {
    typedRoutes: true,
  },

  // The webhook + checkout routes need raw bodies and Node APIs.
  // Pin them to the Node runtime; the page itself can run on the
  // edge later if we want.
  serverExternalPackages: ["stripe"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
