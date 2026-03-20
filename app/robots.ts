import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/portal/', '/admin/', '/api/', '/login', '/register'],
    },
    sitemap: 'https://partnersinbiz.com/sitemap.xml',
  }
}
