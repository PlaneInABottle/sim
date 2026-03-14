/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_ENABLE_CAREERS_LINK: undefined as string | boolean | number | undefined,
  DOCKER_BUILD: undefined as string | boolean | number | undefined,
  NEXT_PUBLIC_APP_URL: undefined as string | undefined,
}))

vi.mock('./lib/core/config/env', () => ({
  env: mockEnv,
  getEnv: vi.fn(() => undefined),
  isFalsy: (value: string | boolean | number | undefined) =>
    typeof value === 'string' ? value.toLowerCase() === 'false' || value === '0' : value === false,
  isTruthy: (value: string | boolean | number | undefined) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' || value === '1' : Boolean(value),
}))

vi.mock('./lib/core/config/feature-flags', () => ({
  isDev: false,
}))

vi.mock('./lib/core/security/csp', () => ({
  getFormEmbedCSPPolicy: () => 'form-csp',
  getMainCSPPolicy: () => 'main-csp',
  getWorkflowExecutionCSPPolicy: () => 'workflow-csp',
}))

import nextConfig, { getCareersRedirect } from './next.config'

function findRedirect(
  source: string,
  redirects: Awaited<ReturnType<NonNullable<typeof nextConfig.redirects>>>
) {
  return redirects.find((redirect) => redirect.source === source)
}

describe('getCareersRedirect', () => {
  beforeEach(() => {
    mockEnv.NEXT_PUBLIC_ENABLE_CAREERS_LINK = undefined
  })

  it('returns the careers redirect when the flag is unset', () => {
    expect(getCareersRedirect(undefined)).toEqual({
      source: '/careers',
      destination: 'https://jobs.ashbyhq.com/sim',
      permanent: true,
    })
  })

  it('returns null when the flag is false', () => {
    expect(getCareersRedirect('false')).toBeNull()
    expect(getCareersRedirect(false)).toBeNull()
    expect(getCareersRedirect('0')).toBeNull()
  })

  it('returns the careers redirect when the flag is true', () => {
    expect(getCareersRedirect('true')).toEqual({
      source: '/careers',
      destination: 'https://jobs.ashbyhq.com/sim',
      permanent: true,
    })
  })

  it('includes the careers redirect without changing unrelated redirects when enabled', async () => {
    mockEnv.NEXT_PUBLIC_ENABLE_CAREERS_LINK = 'true'

    const redirects = await nextConfig.redirects?.()

    expect(findRedirect('/careers', redirects ?? [])).toEqual({
      source: '/careers',
      destination: 'https://jobs.ashbyhq.com/sim',
      permanent: true,
    })
    expect(findRedirect('/discord', redirects ?? [])).toEqual({
      source: '/discord',
      destination: 'https://discord.gg/Hr4UWYEcTT',
      permanent: false,
    })
    expect(findRedirect('/blog/:path*', redirects ?? [])).toEqual({
      source: '/blog/:path*',
      destination: 'https://sim.ai/studio/:path*',
      permanent: true,
    })
    expect(findRedirect('/rss.xml', redirects ?? [])).toEqual({
      source: '/rss.xml',
      destination: '/studio/rss.xml',
      permanent: true,
    })
  })

  it('omits the careers redirect without changing unrelated redirects when disabled', async () => {
    mockEnv.NEXT_PUBLIC_ENABLE_CAREERS_LINK = 'false'

    const redirects = await nextConfig.redirects?.()

    expect(findRedirect('/careers', redirects ?? [])).toBeUndefined()
    expect(findRedirect('/discord', redirects ?? [])).toEqual({
      source: '/discord',
      destination: 'https://discord.gg/Hr4UWYEcTT',
      permanent: false,
    })
    expect(findRedirect('/blog/:path*', redirects ?? [])).toEqual({
      source: '/blog/:path*',
      destination: 'https://sim.ai/studio/:path*',
      permanent: true,
    })
    expect(findRedirect('/rss.xml', redirects ?? [])).toEqual({
      source: '/rss.xml',
      destination: '/studio/rss.xml',
      permanent: true,
    })
  })
})
