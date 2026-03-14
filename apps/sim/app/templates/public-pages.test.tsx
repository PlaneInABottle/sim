/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockNotFound, mockRedirect, mockFeatureFlags, mockGetSession } = vi.hoisted(() => ({
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  mockRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
  mockFeatureFlags: {
    isPublicTemplatesPagesEnabled: false,
  },
  mockGetSession: vi.fn(async () => null) as ReturnType<typeof vi.fn>,
}))

const mockTemplateMetadataSelect = vi.hoisted(() => vi.fn())

function createTemplateMetadataSelectResult(result: unknown[]) {
  return {
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          limit: async () => result,
        }),
      }),
      innerJoin: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [{ workspace: { id: 'workspace-1' } }],
          }),
        }),
      }),
    }),
  }
}

function createTemplateMetadataRow(status: 'approved' | 'pending' | 'rejected' = 'approved') {
  return {
    template: {
      id: 'template-1',
      name: 'My Template',
      details: { tagline: 'Template tagline' },
      status,
      ogImageUrl: null,
      creatorId: 'creator-1',
    },
    creator: {
      id: 'creator-1',
      details: { xHandle: '@creator' },
    },
  }
}

vi.mock('@sim/db', () => ({
  db: {
    select: mockTemplateMetadataSelect,
  },
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicTemplatesPagesEnabled() {
    return mockFeatureFlags.isPublicTemplatesPagesEnabled
  },
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: () => 'https://example.com',
}))

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}))

vi.mock('@/app/templates/templates', () => ({
  default: () => null,
}))

vi.mock('@/app/templates/[id]/template', () => ({
  default: () => null,
}))

import TemplateDetailLayout from './[id]/layout'
import TemplatePage, { generateMetadata } from './[id]/page'
import TemplatesPage from './page'

describe('public templates pages', () => {
  beforeEach(() => {
    mockFeatureFlags.isPublicTemplatesPagesEnabled = false
    mockGetSession.mockResolvedValue(null)
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    mockTemplateMetadataSelect.mockReset()
    mockTemplateMetadataSelect.mockImplementation(() => createTemplateMetadataSelectResult([]))
  })

  it('returns notFound for disabled public templates list page', async () => {
    await expect(TemplatesPage()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  it('returns notFound for disabled public template detail page', () => {
    expect(() => TemplatePage()).toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  it('preserves authenticated redirect ownership in template detail layout', async () => {
    mockFeatureFlags.isPublicTemplatesPagesEnabled = true
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })

    await expect(
      TemplateDetailLayout({
        children: null,
        params: Promise.resolve({ id: 'template-1' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalled()
  })

  it('returns noindex metadata when public templates pages are disabled', async () => {
    mockTemplateMetadataSelect.mockReturnValueOnce(
      createTemplateMetadataSelectResult([createTemplateMetadataRow()])
    )

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'template-1' }),
    })

    expect(metadata.title).toBe('Template Not Found')
    expect(metadata.openGraph).toBeUndefined()
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    })
  })

  it('returns noindex metadata for non-approved templates', async () => {
    mockFeatureFlags.isPublicTemplatesPagesEnabled = true
    mockTemplateMetadataSelect.mockReturnValueOnce(
      createTemplateMetadataSelectResult([createTemplateMetadataRow('pending')])
    )

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'template-1' }),
    })

    expect(metadata.title).toBe('Template Not Found')
    expect(metadata.openGraph).toBeUndefined()
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    })
  })

  it('returns public metadata for approved templates when public pages are enabled', async () => {
    mockFeatureFlags.isPublicTemplatesPagesEnabled = true
    mockTemplateMetadataSelect.mockReturnValueOnce(
      createTemplateMetadataSelectResult([createTemplateMetadataRow('approved')])
    )

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'template-1' }),
    })

    expect(metadata.title).toBe('My Template')
    expect(metadata.description).toBe('Template tagline')
    expect(metadata.openGraph?.url).toBe('https://example.com/templates/template-1')
  })
})
