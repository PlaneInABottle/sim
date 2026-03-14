import { describe, expect, it } from 'vitest'
import { getAuthLegalLinkConfig, isHostedAppUrl, isPublicPageEnabled } from './feature-flags'

describe('isPublicPageEnabled', () => {
  it('treats unset flags as enabled', () => {
    expect(isPublicPageEnabled(undefined)).toBe(true)
  })

  it('treats explicit true values as enabled', () => {
    expect(isPublicPageEnabled(true)).toBe(true)
    expect(isPublicPageEnabled('true')).toBe(true)
    expect(isPublicPageEnabled('1')).toBe(true)
  })

  it('treats explicit false values as disabled', () => {
    expect(isPublicPageEnabled(false)).toBe(false)
    expect(isPublicPageEnabled('false')).toBe(false)
    expect(isPublicPageEnabled('0')).toBe(false)
  })
})

describe('isHostedAppUrl', () => {
  it('preserves hosted url detection semantics', () => {
    expect(isHostedAppUrl('https://www.sim.ai')).toBe(true)
    expect(isHostedAppUrl('https://www.staging.sim.ai')).toBe(true)
    expect(isHostedAppUrl('https://example.com')).toBe(false)
    expect(isHostedAppUrl(undefined)).toBe(false)
  })
})

describe('public page visibility helpers', () => {
  it('do not depend on hosted app url detection', () => {
    expect(isPublicPageEnabled(undefined)).toBe(true)
    expect(isPublicPageEnabled(undefined)).toBe(true)
    expect(isPublicPageEnabled('false')).toBe(false)
    expect(isHostedAppUrl('https://www.sim.ai')).toBe(true)
    expect(isHostedAppUrl('https://example.com')).toBe(false)
  })
})

describe('getAuthLegalLinkConfig', () => {
  it('returns internal links when legal pages are enabled', () => {
    expect(
      getAuthLegalLinkConfig({
        isLegalPagesEnabled: true,
        internalHref: '/terms',
        externalHref: 'https://legal.example.com/terms',
      })
    ).toEqual({ href: '/terms', isExternal: false })
  })

  it('falls back to external links when legal pages are disabled', () => {
    expect(
      getAuthLegalLinkConfig({
        isLegalPagesEnabled: false,
        internalHref: '/privacy',
        externalHref: 'https://legal.example.com/privacy',
      })
    ).toEqual({ href: 'https://legal.example.com/privacy', isExternal: true })
  })

  it('returns null only when legal pages are disabled and no external link exists', () => {
    expect(
      getAuthLegalLinkConfig({
        isLegalPagesEnabled: false,
        internalHref: '/terms',
      })
    ).toBeNull()
  })
})
