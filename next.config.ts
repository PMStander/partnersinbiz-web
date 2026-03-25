// turbopack.root is not yet in the NextConfig types but is a valid runtime option
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextConfig: any = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
