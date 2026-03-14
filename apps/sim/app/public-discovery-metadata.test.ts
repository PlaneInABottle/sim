/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFeatureFlags, mockGetAllPostMeta } = vi.hoisted(() => ({
  mockFeatureFlags: {
    isPublicLandingPageEnabled: true,
    isPublicStudioPagesEnabled: true,
    isPublicChangelogPageEnabled: true,
    isPublicLegalPagesEnabled: true,
    isPublicTemplatesPagesEnabled: true,
  },
  mockGetAllPostMeta: vi.fn(async () => [
    {
      canonical: 'https://example.com/studio/post-1',
      updated: '2025-01-02',
      date: '2025-01-01',
    },
  ]),
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: () => 'https://example.com',
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicLandingPageEnabled() {
    return mockFeatureFlags.isPublicLandingPageEnabled
  },
  get isPublicStudioPagesEnabled() {
    return mockFeatureFlags.isPublicStudioPagesEnabled
  },
  get isPublicChangelogPageEnabled() {
    return mockFeatureFlags.isPublicChangelogPageEnabled
  },
  get isPublicLegalPagesEnabled() {
    return mockFeatureFlags.isPublicLegalPagesEnabled
  },
  get isPublicTemplatesPagesEnabled() {
    return mockFeatureFlags.isPublicTemplatesPagesEnabled
  },
}))

vi.mock('@/lib/blog/registry', () => ({
  getAllPostMeta: mockGetAllPostMeta,
}))

import robots from './robots'
import sitemap from './sitemap'

describe('public discovery metadata', () => {
  beforeEach(() => {
    mockFeatureFlags.isPublicLandingPageEnabled = true
    mockFeatureFlags.isPublicStudioPagesEnabled = true
    mockFeatureFlags.isPublicChangelogPageEnabled = true
    mockFeatureFlags.isPublicLegalPagesEnabled = true
    mockFeatureFlags.isPublicTemplatesPagesEnabled = true
  })

  it('omits disabled routes from sitemap output', async () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false
    mockFeatureFlags.isPublicStudioPagesEnabled = false
    mockFeatureFlags.isPublicChangelogPageEnabled = false
    mockFeatureFlags.isPublicLegalPagesEnabled = false
    mockFeatureFlags.isPublicTemplatesPagesEnabled = false

    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)

    expect(urls).not.toContain('https://example.com')
    expect(urls).not.toContain('https://example.com/studio')
    expect(urls).not.toContain('https://example.com/templates')
    expect(urls).not.toContain('https://example.com/changelog')
    expect(urls).not.toContain('https://example.com/terms')
    expect(urls).not.toContain('https://example.com/privacy')
  })

  it('adds disabled routes to robots disallow list while preserving private entries', () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false
    mockFeatureFlags.isPublicStudioPagesEnabled = false
    mockFeatureFlags.isPublicChangelogPageEnabled = false
    mockFeatureFlags.isPublicLegalPagesEnabled = false
    mockFeatureFlags.isPublicTemplatesPagesEnabled = false

    const metadata = robots()
    const rootRule = metadata.rules?.[0]
    const disallow = Array.isArray(rootRule?.disallow) ? rootRule.disallow : []

    expect(disallow).toContain('/api/')
    expect(disallow).toContain('/workspace/')
    expect(disallow).toContain('/_next/')
    expect(disallow).not.toContain('/')
    expect(disallow).toContain('/studio')
    expect(disallow).toContain('/changelog')
    expect(disallow).toContain('/terms')
    expect(disallow).toContain('/privacy')
    expect(disallow).toContain('/templates')
  })
})
