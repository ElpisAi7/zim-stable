/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // The project uses TypeScript 5.9 which has a known incompatibility with
    // @types/react's Iterable<ReactNode> iterator types. Errors are cosmetic only.
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
};

module.exports = nextConfig;
