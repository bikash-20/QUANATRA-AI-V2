import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Suppress the Next.js dev tools indicator (the small "N" / build-
  // progress badge in the corner of the viewport during `next dev`).
  // The user reported a "round black floating button on the right edge
  // of the Explore page" which matches this overlay; it is dev-only and
  // never appears in production builds, but disabling it makes the dev
  // surface match production.
  devIndicators: false,
};

export default nextConfig;
