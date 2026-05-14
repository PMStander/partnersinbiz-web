import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk, Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import { SITE } from '@/lib/seo/site'
import { organizationGraph, JsonLd } from '@/lib/seo/schema'
import { PwaRegistrar } from '@/components/pwa/PwaRegistrar'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })
const geistSans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
    { media: '(prefers-color-scheme: light)', color: '#0A0A0B' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Web, AI & Growth Studio for Ambitious SMEs`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: 'black-translucent',
  },
  keywords: [
    'web development South Africa',
    'Next.js development agency',
    'AI integration consultancy',
    'custom software development Pretoria',
    'website design South Africa',
    'AI agent development',
    'Vercel deployment partner',
    'Firebase developer',
  ],
  authors: [{ name: SITE.founder.name, url: `${SITE.url}/about` }],
  creator: SITE.founder.name,
  publisher: SITE.name,
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — Web, AI & Growth Studio`,
    description: SITE.description,
    images: [
      {
        url: '/og/default.png',
        width: 1200,
        height: 630,
        alt: SITE.name,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@partnersinbiz',
    creator: '@peetstander',
    title: SITE.name,
    description: SITE.description,
    images: ['/og/default.png'],
  },
  alternates: {
    canonical: '/',
    languages: { 'en-ZA': '/', 'x-default': '/' },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
  category: 'technology',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} bg-[var(--pib-bg)] text-[var(--pib-text)] font-sans antialiased selection:bg-[var(--pib-accent)] selection:text-black`}
      >
        <JsonLd data={organizationGraph} />
        <PwaRegistrar />
        {children}
        <InstallPrompt />
        <Analytics />
      </body>
    </html>
  )
}
