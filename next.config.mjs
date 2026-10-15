/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // exceljs and googleapis are Node-only; keep them out of the client bundle.
  serverExternalPackages: ['exceljs', 'googleapis'],
};

export default nextConfig;
