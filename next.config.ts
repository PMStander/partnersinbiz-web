import path from 'path'

const nextConfig = {
  turbopack: {
    root: path.resolve('.'),
  },
  transpilePackages: ['@partnersinbiz/analytics-js'],
  serverExternalPackages: ['@react-pdf/renderer'],
  async redirects() {
    return [
      { source: '/discover', destination: '/work', permanent: true },
      { source: '/products', destination: '/services/web-applications', permanent: true },
    ]
  },
}

export default nextConfig
