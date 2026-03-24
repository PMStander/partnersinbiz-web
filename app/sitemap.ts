import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://partnersinbiz.com'
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/our-process`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/discover`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/products`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/start-a-project`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.9 },
  ]
}
