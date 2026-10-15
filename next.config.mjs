/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: false,
  },
};

export default nextConfig;
