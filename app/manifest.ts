import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StoryLines',
    short_name: 'StoryLines',
    description: 'Read, write, and share stories and illustrated work with your creative community.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f5ef',
    theme_color: '#4b3325',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/storylines-logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/storylines-logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
