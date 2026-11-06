const pkg = require('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Versión y build visibles en el pie de página (Vercel expone el commit en VERCEL_GIT_COMMIT_SHA)
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
  },
};

module.exports = nextConfig;
