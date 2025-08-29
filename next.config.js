/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://pagead2.googlesyndication.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-src https://www.youtube.com https://player.twitch.tv; connect-src 'self' https://*.up.railway.app wss://*.up.railway.app ws://localhost:* wss://localhost:*; media-src 'self' https:; object-src 'none';"
          }
        ]
      }
    ]
  }
};

module.exports = nextConfig;