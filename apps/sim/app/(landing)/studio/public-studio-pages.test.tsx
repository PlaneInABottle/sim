/**
 * @vitest-environment node
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNotFound, mockFeatureFlags, mockGetAllPostMeta } = vi.hoisted(() => ({
  mockNotFound: vi.fn(),
  mockFeatureFlags: {
    isPublicStudioPagesEnabled: true,
  },
  mockGetAllPostMeta: vi.fn(async () => [
    {
      title: 'Studio Post',
      canonical: 'https://sim.ai/studio/post-1',
      date: '2025-01-01',
      description: 'Desc',
      author: { name: 'Author' },
      authors: [{ name: 'Author' }],
      ogImage: '/og.png',
    },
  ]),
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicStudioPagesEnabled() {
    return mockFeatureFlags.isPublicStudioPagesEnabled
  },
}))

vi.mock('@/lib/blog/registry', () => ({
  getAllPostMeta: mockGetAllPostMeta,
}))

vi.mock('@/app/(landing)/components', () => ({
  Nav: () => <div>nav</div>,
  Footer: () => <div>footer</div>,
}))

import StudioLayout from './layout'
import { GET as getRss } from './rss.xml/route'
import { GET as getImageSitemap } from './sitemap-images.xml/route'

describe('public studio pages', () => {
  beforeEach(() => {
    mockFeatureFlags.isPublicStudioPagesEnabled = true
    mockNotFound.mockClear()
    mockGetAllPostMeta.mockClear()
  })

  it('renders studio layout when enabled', () => {
    const html = renderToStaticMarkup(<StudioLayout>{<div>studio child</div>}</StudioLayout>)

    expect(html).toContain('studio child')
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('calls notFound from studio layout when disabled', () => {
    mockFeatureFlags.isPublicStudioPagesEnabled = false

    renderToStaticMarkup(<StudioLayout>{<div>studio child</div>}</StudioLayout>)

    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  it('returns 404 from studio rss when disabled', async () => {
    mockFeatureFlags.isPublicStudioPagesEnabled = false

    const response = await getRss()

    expect(response.status).toBe(404)
  })

  it('returns 404 from studio image sitemap when disabled', async () => {
    mockFeatureFlags.isPublicStudioPagesEnabled = false

    const response = await getImageSitemap()

    expect(response.status).toBe(404)
  })
})
