/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl?.protocol.slice(0, -1) ?? 'https',
        hostname: supabaseUrl?.hostname ?? '**.supabase.co',
        port: supabaseUrl?.port ?? '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
