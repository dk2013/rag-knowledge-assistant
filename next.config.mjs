/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg and unpdf run only on the server; keep them out of the bundler
  serverExternalPackages: ["pg", "unpdf"],
};

export default nextConfig;
