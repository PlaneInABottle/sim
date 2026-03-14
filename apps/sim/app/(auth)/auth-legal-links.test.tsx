/**
 * @vitest-environment node
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetEnv, mockFeatureFlags } = vi.hoisted(() => ({
  mockGetEnv: vi.fn((key: string) => {
    if (key === 'NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED') return 'true'
    if (key === 'NEXT_PUBLIC_SSO_ENABLED') return 'false'
    return undefined
  }),
  mockFeatureFlags: {
    getAuthTermsLinkConfig: (() => ({ href: '/terms', isExternal: false })) as () => {
      href: string
      isExternal: boolean
    } | null,
    getAuthPrivacyLinkConfig: (() => ({ href: '/privacy', isExternal: false })) as () => {
      href: string
      isExternal: boolean
    } | null,
  },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={typeof href === 'string' ? href : ''} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter', variable: '--font-inter' }),
}))

vi.mock('next/font/local', () => ({
  default: () => ({ className: 'font-soehne', variable: '--font-soehne' }),
}))

vi.mock('@/lib/core/config/env', () => ({
  getEnv: mockGetEnv,
  isTruthy: (value: string | undefined) => value === 'true',
  isFalsy: (value: string | undefined) => value === 'false',
  env: {
    NEXT_PUBLIC_EMAIL_PASSWORD_SIGNUP_ENABLED: 'true',
  },
}))

vi.mock('@/lib/core/config/feature-flags', () => ({
  getAuthTermsLinkConfig: () => mockFeatureFlags.getAuthTermsLinkConfig(),
  getAuthPrivacyLinkConfig: () => mockFeatureFlags.getAuthPrivacyLinkConfig(),
}))

vi.mock('@/lib/auth/auth-client', () => ({
  client: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    forgetPassword: vi.fn(),
  },
  useSession: () => ({ refetch: vi.fn() }),
}))

vi.mock('@/hooks/use-branded-button-class', () => ({
  useBrandedButtonClass: () => 'brand-button',
}))

vi.mock('@/app/(auth)/components/branded-button', () => ({
  BrandedButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))

vi.mock('@/app/(auth)/components/social-login-buttons', () => ({
  SocialLoginButtons: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/app/(auth)/components/sso-login-button', () => ({
  SSOLoginButton: () => <button>SSO</button>,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))

vi.mock('@/lib/core/utils/cn', () => ({
  cn: (...values: Array<string | undefined | false>) => values.filter(Boolean).join(' '),
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: () => 'https://example.com',
}))

vi.mock('@/lib/messaging/email/validation', () => ({
  quickValidateEmail: () => ({ isValid: true }),
}))

import SSOForm from '../../ee/sso/components/sso-form'
import LoginPage from './login/login-form'
import SignupPage from './signup/signup-form'

describe('auth legal link rendering', () => {
  beforeEach(() => {
    mockFeatureFlags.getAuthTermsLinkConfig = () => ({ href: '/terms', isExternal: false })
    mockFeatureFlags.getAuthPrivacyLinkConfig = () => ({ href: '/privacy', isExternal: false })
  })

  it('renders internal legal links on auth surfaces when legal pages are enabled', () => {
    const loginHtml = renderToStaticMarkup(
      <LoginPage githubAvailable={false} googleAvailable={false} isProduction={false} />
    )
    const signupHtml = renderToStaticMarkup(
      <SignupPage githubAvailable={false} googleAvailable={false} isProduction={false} />
    )
    const ssoHtml = renderToStaticMarkup(<SSOForm />)

    expect(loginHtml).toContain('href="/terms"')
    expect(loginHtml).toContain('href="/privacy"')
    expect(signupHtml).toContain('href="/terms"')
    expect(signupHtml).toContain('href="/privacy"')
    expect(ssoHtml).toContain('href="/terms"')
    expect(ssoHtml).toContain('href="/privacy"')
  })

  it('renders external legal links on auth surfaces when legal pages are disabled but external urls exist', () => {
    mockFeatureFlags.getAuthTermsLinkConfig = () => ({
      href: 'https://legal.example.com/terms',
      isExternal: true,
    })
    mockFeatureFlags.getAuthPrivacyLinkConfig = () => ({
      href: 'https://legal.example.com/privacy',
      isExternal: true,
    })

    const loginHtml = renderToStaticMarkup(
      <LoginPage githubAvailable={false} googleAvailable={false} isProduction={false} />
    )

    expect(loginHtml).toContain('href="https://legal.example.com/terms"')
    expect(loginHtml).toContain('href="https://legal.example.com/privacy"')
  })

  it('hides only the missing individual legal link when no external fallback exists', () => {
    mockFeatureFlags.getAuthTermsLinkConfig = () => null
    mockFeatureFlags.getAuthPrivacyLinkConfig = () => ({
      href: 'https://legal.example.com/privacy',
      isExternal: true,
    })

    const loginHtml = renderToStaticMarkup(
      <LoginPage githubAvailable={false} googleAvailable={false} isProduction={false} />
    )

    expect(loginHtml).not.toContain('Terms of Service</a>')
    expect(loginHtml).toContain('Privacy Policy</a>')
    expect(loginHtml).toContain('href="https://legal.example.com/privacy"')
  })
})
