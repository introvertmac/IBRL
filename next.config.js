/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'i0.wp.com',
      'static.toiimg.com'
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

module.exports = nextConfig
