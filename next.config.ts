import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  reactStrictMode: true,
}

export default nextConfig
