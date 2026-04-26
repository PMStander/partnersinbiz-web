import path from 'path'

// turbopack.root must be an absolute path — __dirname compiles to "." via esbuild
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextConfig: any = {
  turbopack: {
    root: path.resolve('.'),
  },
  transpilePackages: ['@partnersinbiz/analytics-js'],
  async redirects() {
    return [
      { source: '/discover', destination: '/work', permanent: true },
      { source: '/products', destination: '/services/web-applications', permanent: true },
    ]
  },
};

export default nextConfig;
