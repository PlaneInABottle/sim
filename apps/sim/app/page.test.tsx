/**
 * @vitest-environment node
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { mockNotFound, mockFeatureFlags } = vi.hoisted(() => ({
  mockNotFound: vi.fn(),
  mockFeatureFlags: {
    isPublicLandingPageEnabled: true,
  },
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicLandingPageEnabled() {
    return mockFeatureFlags.isPublicLandingPageEnabled
  },
}))

vi.mock('@/app/(home)/landing', () => ({
  default: () => <div>Landing content</div>,
}))

import Page from './page'

describe('app/page', () => {
  it('renders the landing page when enabled', () => {
    mockFeatureFlags.isPublicLandingPageEnabled = true

    const html = renderToStaticMarkup(<Page />)

    expect(html).toContain('Landing content')
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('calls notFound when landing page is disabled', () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false

    renderToStaticMarkup(<Page />)

    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })
})
