/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNotFound, mockRedirect, mockFeatureFlags, mockEnvValues, mockGetEnv } = vi.hoisted(
  () => ({
    mockNotFound: vi.fn(),
    mockRedirect: vi.fn(),
    mockFeatureFlags: {
      isPublicLegalPagesEnabled: true,
    },
    mockEnvValues: {} as Record<string, string | undefined>,
    mockGetEnv: vi.fn((key: string) => mockEnvValues[key]),
  })
)

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock('@/lib/core/config/env', () => ({
  getEnv: mockGetEnv,
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicLegalPagesEnabled() {
    return mockFeatureFlags.isPublicLegalPagesEnabled
  },
}))

vi.mock('@/app/(landing)/components', () => ({
  LegalLayout: ({ children }: { children: React.ReactNode }) => children,
}))

import PrivacyPolicy from './privacy/page'
import TermsOfService from './terms/page'

describe('landing legal pages', () => {
  beforeEach(() => {
    mockFeatureFlags.isPublicLegalPagesEnabled = true
    mockEnvValues.NEXT_PUBLIC_PRIVACY_URL = undefined
    mockEnvValues.NEXT_PUBLIC_TERMS_URL = undefined
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    mockGetEnv.mockClear()
  })

  it('calls notFound when legal pages are disabled', () => {
    mockFeatureFlags.isPublicLegalPagesEnabled = false

    PrivacyPolicy()
    TermsOfService()

    expect(mockNotFound).toHaveBeenCalledTimes(2)
  })

  it('preserves privacy external redirect behavior when legal pages are enabled', () => {
    mockEnvValues.NEXT_PUBLIC_PRIVACY_URL = 'https://legal.example.com/privacy'

    PrivacyPolicy()

    expect(mockRedirect).toHaveBeenCalledWith('https://legal.example.com/privacy')
  })

  it('preserves terms external redirect behavior when legal pages are enabled', () => {
    mockEnvValues.NEXT_PUBLIC_TERMS_URL = 'https://legal.example.com/terms'

    TermsOfService()

    expect(mockRedirect).toHaveBeenCalledWith('https://legal.example.com/terms')
  })
})
