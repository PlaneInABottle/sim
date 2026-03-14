/**
 * @vitest-environment node
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFeatureFlags } = vi.hoisted(() => ({
  mockFeatureFlags: {
    isHosted: true,
    isPublicCareersLinkEnabled: true,
    isPublicLandingPageEnabled: true,
    isPublicStudioPagesEnabled: true,
    isPublicChangelogPageEnabled: true,
    isPublicLegalPagesEnabled: true,
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter', variable: '--font-inter' }),
}))

vi.mock('next/font/local', () => ({
  default: () => ({ className: 'font-soehne', variable: '--font-soehne' }),
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  get isHosted() {
    return mockFeatureFlags.isHosted
  },
  get isPublicCareersLinkEnabled() {
    return mockFeatureFlags.isPublicCareersLinkEnabled
  },
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
}))

vi.mock('@/app/(landing)/actions/github', () => ({
  getFormattedGitHubStars: vi.fn(async () => '26.1k'),
}))

vi.mock('@/ee/whitelabeling', () => ({
  useBrandConfig: () => ({ name: 'Sim', logoUrl: undefined }),
}))

vi.mock('@/hooks/use-branded-button-class', () => ({
  useBrandedButtonClass: () => 'brand-button',
}))

vi.mock('@/app/(landing)/components/footer/components/compliance-badges', () => ({
  default: () => <div>ComplianceBadges</div>,
}))

vi.mock('@/app/(landing)/components/footer/components/social-links', () => ({
  default: () => <div>SocialLinks</div>,
}))

vi.mock('@/app/(landing)/components/footer/components/status-indicator', () => ({
  default: () => <div>StatusIndicator</div>,
}))

import Footer from './footer/footer'
import Nav from './nav/nav'

function getLinkSegment(html: string, text: string): string {
  const marker = `>${text}</a>`
  const endIndex = html.indexOf(marker)

  if (endIndex === -1) {
    return ''
  }

  const startIndex = html.lastIndexOf('<a ', endIndex)

  return startIndex === -1 ? '' : html.slice(startIndex, endIndex + marker.length)
}

describe('public page links', () => {
  beforeEach(() => {
    mockFeatureFlags.isHosted = true
    mockFeatureFlags.isPublicCareersLinkEnabled = true
    mockFeatureFlags.isPublicLandingPageEnabled = true
    mockFeatureFlags.isPublicStudioPagesEnabled = true
    mockFeatureFlags.isPublicChangelogPageEnabled = true
    mockFeatureFlags.isPublicLegalPagesEnabled = true
  })

  it('shows landing pricing link in nav when landing page is enabled', () => {
    const html = renderToStaticMarkup(<Nav variant='landing' />)

    expect(html).toContain('Pricing')
    expect(getLinkSegment(html, 'Pricing')).toContain('href="/?from=nav#pricing"')
    expect(html).toContain('href="/?from=nav"')
  })

  it('hides landing pricing link in nav when landing page is disabled while keeping auth buttons hosted-only', () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false

    const html = renderToStaticMarkup(<Nav variant='landing' />)

    expect(html).not.toContain('Pricing')
    expect(html).toContain('Get started')
    expect(html).toContain('Log in')
    expect(html).not.toContain('href="/?from=nav"')
  })

  it('hides disabled footer links and keeps enabled ones', () => {
    mockFeatureFlags.isPublicLandingPageEnabled = false
    mockFeatureFlags.isPublicStudioPagesEnabled = false
    mockFeatureFlags.isPublicChangelogPageEnabled = false
    mockFeatureFlags.isPublicLegalPagesEnabled = false
    mockFeatureFlags.isPublicCareersLinkEnabled = false

    const html = renderToStaticMarkup(<Footer />)

    expect(html).not.toContain('Sim Studio')
    expect(html).not.toContain('Changelog')
    expect(html).not.toContain('Pricing')
    expect(html).not.toContain('Privacy Policy')
    expect(html).not.toContain('Terms of Service')
    expect(html).not.toContain('Careers')
    expect(html).toContain('Docs')
    expect(html).toContain('Enterprise')
    expect(html).not.toContain('href="/"')
  })

  it('hides careers links in nav and footer when careers link is disabled', () => {
    mockFeatureFlags.isPublicCareersLinkEnabled = false

    const navHtml = renderToStaticMarkup(<Nav variant='landing' />)
    const footerHtml = renderToStaticMarkup(<Footer />)

    expect(navHtml).not.toContain('>Careers<')
    expect(footerHtml).not.toContain('>Careers<')
  })
})
