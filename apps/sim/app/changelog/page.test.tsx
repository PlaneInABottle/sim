/**
 * @vitest-environment node
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { mockNotFound, mockFeatureFlags } = vi.hoisted(() => ({
  mockNotFound: vi.fn(),
  mockFeatureFlags: {
    isPublicChangelogPageEnabled: true,
  },
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicChangelogPageEnabled() {
    return mockFeatureFlags.isPublicChangelogPageEnabled
  },
}))

vi.mock('@/app/changelog/components/changelog-content', () => ({
  default: () => <div>Changelog content</div>,
}))

import ChangelogPage from './page'

describe('app/changelog/page', () => {
  it('renders the changelog when enabled', () => {
    mockFeatureFlags.isPublicChangelogPageEnabled = true

    const html = renderToStaticMarkup(<ChangelogPage />)

    expect(html).toContain('Changelog content')
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('calls notFound when changelog is disabled', () => {
    mockFeatureFlags.isPublicChangelogPageEnabled = false

    renderToStaticMarkup(<ChangelogPage />)

    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })
})
