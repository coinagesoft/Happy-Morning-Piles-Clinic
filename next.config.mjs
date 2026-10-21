/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // WhatsApp (Baileys) must run as a normal Node package, not be bundled
  serverExternalPackages: ['@whiskeysockets/baileys', 'pino', 'qrcode'],
};

export default nextConfig;
