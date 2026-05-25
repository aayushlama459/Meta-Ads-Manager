/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ffmpeg-static ships a native binary alongside a JS shim that resolves to
  // its real path. If webpack bundles it into .next/server/vendor-chunks the
  // exported path no longer points anywhere, so we must leave it in node_modules.
  experimental: {
    serverComponentsExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3']
    }
    return config
  },
}

export default nextConfig
