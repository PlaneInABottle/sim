/**
 * @vitest-environment node
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFeatureFlags } = vi.hoisted(() => ({
  mockFeatureFlags: {
    isPublicCareersLinkEnabled: true,
  },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={typeof href === 'string' ? href : ''} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/image', () => ({
  default: (props: React.ComponentProps<'img'>) => <img {...props} alt={props.alt ?? ''} />,
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isPublicCareersLinkEnabled() {
    return mockFeatureFlags.isPublicCareersLinkEnabled
  },
}))

vi.mock('@/app/(home)/components/navbar/components/github-stars', () => ({
  GitHubStars: () => <div>GitHubStars</div>,
}))

import Navbar from './navbar'

describe('home navbar careers link', () => {
  beforeEach(() => {
    mockFeatureFlags.isPublicCareersLinkEnabled = true
  })

  it('hides careers when the careers link flag is disabled', () => {
    mockFeatureFlags.isPublicCareersLinkEnabled = false

    const html = renderToStaticMarkup(<Navbar />)

    expect(html).not.toContain('>Careers<')
    expect(html).toContain('>Docs<')
    expect(html).toContain('>Pricing<')
    expect(html).toContain('>Enterprise<')
  })

  it('keeps careers in the original position when the flag is enabled', () => {
    const html = renderToStaticMarkup(<Navbar />)

    expect(html).toContain('>Pricing<')
    expect(html).toContain('>Careers<')
    expect(html).toContain('>Enterprise<')
    expect(html.indexOf('>Pricing<')).toBeLessThan(html.indexOf('>Careers<'))
    expect(html.indexOf('>Careers<')).toBeLessThan(html.indexOf('>Enterprise<'))
  })
})
