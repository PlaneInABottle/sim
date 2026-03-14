import type { MetadataRoute } from 'next'
import { getAllPostMeta } from '@/lib/blog/registry'
import {
  isPublicChangelogPageEnabled,
  isPublicLandingPageEnabled,
  isPublicLegalPagesEnabled,
  isPublicStudioPagesEnabled,
  isPublicTemplatesPagesEnabled,
} from '@/lib/core/config/feature-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()

  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    ...(isPublicLandingPageEnabled
      ? [
          {
            url: baseUrl,
            lastModified: now,
          },
        ]
      : []),
    ...(isPublicStudioPagesEnabled
      ? [
          {
            url: `${baseUrl}/studio`,
            lastModified: now,
          },
          {
            url: `${baseUrl}/studio/tags`,
            lastModified: now,
          },
        ]
      : []),
    ...(isPublicTemplatesPagesEnabled
      ? [
          {
            url: `${baseUrl}/templates`,
            lastModified: now,
          },
        ]
      : []),
    ...(isPublicChangelogPageEnabled
      ? [
          {
            url: `${baseUrl}/changelog`,
            lastModified: now,
          },
        ]
      : []),
    ...(isPublicLegalPagesEnabled
      ? [
          {
            url: `${baseUrl}/terms`,
            lastModified: new Date('2024-10-14'),
          },
          {
            url: `${baseUrl}/privacy`,
            lastModified: new Date('2024-10-14'),
          },
        ]
      : []),
  ]

  const posts = await getAllPostMeta()
  const blogPages: MetadataRoute.Sitemap = isPublicStudioPagesEnabled
    ? posts.map((p) => ({
        url: p.canonical,
        lastModified: new Date(p.updated ?? p.date),
      }))
    : []

  return [...staticPages, ...blogPages]
}
