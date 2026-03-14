/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFeatureFlags } = vi.hoisted(() => ({
  mockFeatureFlags: {
    isPublicCareersLinkEnabled: true,
    isPublicLandingPageEnabled: true,
    isPublicStudioPagesEnabled: true,
    isPublicChangelogPageEnabled: true,
    isPublicLegalPagesEnabled: true,
    isPublicTemplatesPagesEnabled: true,
  },
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: () => 'https://example.com',
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicLandingPageEnabled() {
    return mockFeatureFlags.isPublicLandingPageEnabled
  },
  get isPublicCareersLinkEnabled() {
    return mockFeatureFlags.isPublicCareersLinkEnabled
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

import { GET as getLlms } from './llms.txt/route'
import { GET as getLlmsFull } from './llms-full.txt/route'

describe('llms public pages', () => {
  beforeEach(() => {
    mockFeatureFlags.isPublicLandingPageEnabled = true
    mockFeatureFlags.isPublicCareersLinkEnabled = true
    mockFeatureFlags.isPublicStudioPagesEnabled = true
    mockFeatureFlags.isPublicChangelogPageEnabled = true
    mockFeatureFlags.isPublicLegalPagesEnabled = true
    mockFeatureFlags.isPublicTemplatesPagesEnabled = true
  })

  it('omits disabled internal public links from llms.txt', async () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false
    mockFeatureFlags.isPublicCareersLinkEnabled = false
    mockFeatureFlags.isPublicStudioPagesEnabled = false
    mockFeatureFlags.isPublicChangelogPageEnabled = false
    mockFeatureFlags.isPublicLegalPagesEnabled = false
    mockFeatureFlags.isPublicTemplatesPagesEnabled = false

    const response = await getLlms()
    const content = await response.text()

    expect(content).not.toContain('https://example.com): Main landing page')
    expect(content).not.toContain('https://example.com/templates')
    expect(content).not.toContain('https://example.com/changelog')
    expect(content).not.toContain('https://example.com/studio')
    expect(content).not.toContain('https://example.com/terms')
    expect(content).not.toContain('https://example.com/privacy')
    expect(content).not.toContain('https://jobs.ashbyhq.com/sim')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400')
  })

  it('omits disabled internal public links from llms-full.txt while preserving external links', async () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false
    mockFeatureFlags.isPublicLegalPagesEnabled = false

    const response = await getLlmsFull()
    const content = await response.text()

    expect(content).not.toContain('- **Website**: https://example.com')
    expect(content).not.toContain('- **Terms of Service**: https://example.com/terms')
    expect(content).not.toContain('- **Privacy Policy**: https://example.com/privacy')
    expect(content).toContain('- **Documentation**: https://docs.sim.ai')
    expect(content).toContain('- **GitHub**: https://github.com/simstudioai/sim')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400')
  })
})
