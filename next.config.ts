import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Content-Security-Policy",
    // Google origins are for the screenshot editor canvas fonts only – the UI font stays
    // self-hosted via next/font. connect-src takes no remote origin (the font catalog is
    // embedded); `blob:` is only for three's GLTFLoader, which reads the textures embedded
    // in our own .glb files through ImageBitmapLoader – i.e. fetch() on a blob: URL that
    // the page itself created. No remote destination becomes reachable.
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://*.mzstatic.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' blob:",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.mzstatic.com",
      },
    ],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
