import type { MetadataRoute } from 'next'
import { getAllPostMeta } from '@/lib/blog/registry'
import { isHosted } from '@/lib/core/config/feature-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const now = new Date()

  // For self-hosted, only include essential pages
  if (!isHosted) {
    return [
      {
        url: baseUrl,
        lastModified: now,
      },
    ]
  }

  // For hosted (sim.ai), include all marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/blog/tags`,
      lastModified: now,
    },
    // {
    //   url: `${baseUrl}/templates`,
    //   lastModified: now,
    // },
    {
      url: `${baseUrl}/changelog`,
      lastModified: now,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date('2024-10-14'),
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date('2024-10-14'),
    },
  ]

  const posts = await getAllPostMeta()
  const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: p.canonical,
    lastModified: new Date(p.updated ?? p.date),
  }))

  return [...staticPages, ...blogPages]
}
