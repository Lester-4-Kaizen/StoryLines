import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DM_Serif_Display, Geist } from 'next/font/google'
import './globals.css'
import { AppStateProvider } from '@/lib/app-state'
import { WorksProvider } from '@/lib/works-store'
import { CommunityProvider } from '@/lib/community-store'
import { AppShell } from '@/components/app-shell'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', variable: '--font-dm-serif' })

export const metadata: Metadata = {
  title: 'StoryLines — A home for the stories you carry',
  description: 'Read, write, and share stories and illustrated work with your creative community.',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#4b3325',
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${geist.variable} ${dmSerif.variable} antialiased`}>
        <AppStateProvider>
          <WorksProvider>
            <CommunityProvider>
              <AppShell>{children}</AppShell>
            </CommunityProvider>
          </WorksProvider>
        </AppStateProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}