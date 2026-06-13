import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/onboarding/', '/api/'],
      },
    ],
    sitemap: 'https://www.billeteclaro.com/sitemap.xml',
  }
}
