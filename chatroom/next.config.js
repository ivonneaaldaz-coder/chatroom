/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow embedding from lab.ivonnealdaz.com only
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://lab.ivonnealdaz.com https://*.vercel.app",
          },
        ],
      },
    ]
  },
}
module.exports = nextConfig
