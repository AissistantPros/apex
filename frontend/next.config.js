/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',      // Exportación estática para Cloudflare Pages
  trailingSlash: true,   // Necesario para que las rutas funcionen en Cloudflare
  images: {
    unoptimized: true,   // Requerido para exportación estática
  },
};

module.exports = nextConfig;
