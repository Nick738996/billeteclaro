import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'BilleteClaro — Tu radar financiero',
    template: '%s | BilleteClaro',
  },
  description: 'Tu plata, clara. BilleteClaro lee tus correos de banco automáticamente y te muestra en qué gastas, sin que hagas nada. Gratis.',

  metadataBase: new URL('https://www.billeteclaro.com'),
  alternates: { canonical: '/' },

  keywords: [
    'finanzas personales colombia',
    'control de gastos colombia',
    'app finanzas rappicard',
    'rappipay gastos',
    'presupuesto mensual colombia',
    'asesor financiero ia colombia',
    'billeteclaro',
  ],

  authors: [{ name: 'BilleteClaro' }],
  creator: 'BilleteClaro',
  publisher: 'BilleteClaro',
  applicationName: 'BilleteClaro',

  openGraph: {
    type: 'website',
    locale: 'es_CO',
    url: 'https://www.billeteclaro.com',
    siteName: 'BilleteClaro',
    title: 'BilleteClaro — Tu radar financiero',
    description: 'Tu plata, clara. Lee tus correos de banco automáticamente y te muestra en qué gastas. Sin hacer nada. Gratis.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BilleteClaro — Tu radar financiero personal',
        type: 'image/png',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'BilleteClaro — Tu radar financiero',
    description: 'Tu plata, clara. Lee tus correos de banco y te muestra en qué gastas. Sin hacer nada.',
    images: ['/og-image.png'],
    creator: '@billeteclaro',
  },

  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BilleteClaro',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  verification: {
    google: 'google6c8c64c6b98e19f4',
  },
}

export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

function StructuredData() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'BilleteClaro',
    url: 'https://www.billeteclaro.com',
    description: 'Aplicación de finanzas personales para Colombia. Lee correos de banco automáticamente y muestra gastos, presupuesto y asesor financiero IA.',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'COP' },
    inLanguage: 'es-CO',
    availableLanguage: 'Spanish',
    author: { '@type': 'Organization', name: 'BilleteClaro', url: 'https://www.billeteclaro.com' },
    featureList: [
      'Sincronización automática de correos bancarios',
      'Categorización de gastos con IA',
      'Presupuesto mensual por categoría',
      'Asesor financiero con inteligencia artificial',
      'Compatible con RappiCard, RappiPay y Bancolombia',
    ],
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <StructuredData />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          storageKey="billeteclaro-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
