/**
 * Environment utility functions for consistent environment detection across the application
 */
import { env, getEnv, isFalsy, isTruthy } from './env'

/**
 * Is the application running in production mode
 */
export const isProd = env.NODE_ENV === 'production'

/**
 * Is the application running in development mode
 */
export const isDev = env.NODE_ENV === 'development'

/**
 * Is the application running in test mode
 */
export const isTest = env.NODE_ENV === 'test'

/**
 * Is this the hosted version of the application
 */
export function isHostedAppUrl(value: string | undefined): boolean {
  return value === 'https://www.sim.ai' || value === 'https://www.staging.sim.ai'
}

export const isHosted = isHostedAppUrl(getEnv('NEXT_PUBLIC_APP_URL'))

/**
 * Is billing enforcement enabled
 */
export const isBillingEnabled = isTruthy(env.BILLING_ENABLED)

/**
 * Is email verification enabled
 */
export const isEmailVerificationEnabled = isTruthy(env.EMAIL_VERIFICATION_ENABLED)

/**
 * Is authentication disabled (for self-hosted deployments behind private networks)
 * This flag is blocked when isHosted is true.
 */
export const isAuthDisabled = isTruthy(env.DISABLE_AUTH) && !isHosted

if (isTruthy(env.DISABLE_AUTH)) {
  import('@sim/logger')
    .then(({ createLogger }) => {
      const logger = createLogger('FeatureFlags')
      if (isHosted) {
        logger.error(
          'DISABLE_AUTH is set but ignored on hosted environment. Authentication remains enabled for security.'
        )
      } else {
        logger.warn(
          'DISABLE_AUTH is enabled. Authentication is bypassed and all requests use an anonymous session. Only use this in trusted private networks.'
        )
      }
    })
    .catch(() => {
      // Fallback during config compilation when logger is unavailable
    })
}

/**
 * Is user registration disabled
 */
export const isRegistrationDisabled = isTruthy(env.DISABLE_REGISTRATION)

/**
 * Is email/password authentication enabled (defaults to true)
 */
export const isEmailPasswordEnabled = !isFalsy(env.EMAIL_PASSWORD_SIGNUP_ENABLED)

/**
 * Is Trigger.dev enabled for async job processing
 */
export const isTriggerDevEnabled = isTruthy(env.TRIGGER_DEV_ENABLED)

/**
 * Is SSO enabled for enterprise authentication
 */
export const isSsoEnabled = isTruthy(env.SSO_ENABLED)

/**
 * Is credential sets (email polling) enabled via env var override
 * This bypasses plan requirements for self-hosted deployments
 */
export const isCredentialSetsEnabled = isTruthy(env.CREDENTIAL_SETS_ENABLED)

/**
 * Is access control (permission groups) enabled via env var override
 * This bypasses plan requirements for self-hosted deployments
 */
export const isAccessControlEnabled = isTruthy(env.ACCESS_CONTROL_ENABLED)

/**
 * Is organizations enabled
 * True if billing is enabled (orgs come with billing), OR explicitly enabled via env var,
 * OR if access control is enabled (access control requires organizations)
 */
export const isOrganizationsEnabled =
  isBillingEnabled || isTruthy(env.ORGANIZATIONS_ENABLED) || isAccessControlEnabled

/**
 * Is E2B enabled for remote code execution
 */
export const isE2bEnabled = isTruthy(env.E2B_ENABLED)

/**
 * Are invitations disabled globally
 * When true, workspace invitations are disabled for all users
 */
export const isInvitationsDisabled = isTruthy(env.DISABLE_INVITATIONS)

/**
 * Is public API access disabled globally
 * When true, the public API toggle is hidden and public API access is blocked
 */
export const isPublicApiDisabled = isTruthy(env.DISABLE_PUBLIC_API)

/**
 * Returns true unless the provided public flag is explicitly false.
 */
export function isPublicPageEnabled(value: string | boolean | number | undefined): boolean {
  return !isFalsy(value)
}

/**
 * Is the public landing page enabled.
 */
export const isPublicLandingPageEnabled = isPublicPageEnabled(env.NEXT_PUBLIC_ENABLE_LANDING_PAGE)

/**
 * Are public studio pages and feeds enabled.
 */
export const isPublicStudioPagesEnabled = isPublicPageEnabled(env.NEXT_PUBLIC_ENABLE_STUDIO_PAGES)

/**
 * Is the public changelog page enabled.
 */
export const isPublicChangelogPageEnabled = isPublicPageEnabled(
  env.NEXT_PUBLIC_ENABLE_CHANGELOG_PAGE
)

/**
 * Are public legal pages enabled.
 */
export const isPublicLegalPagesEnabled = isPublicPageEnabled(env.NEXT_PUBLIC_ENABLE_LEGAL_PAGES)

/**
 * Are public templates pages enabled.
 */
export const isPublicTemplatesPagesEnabled = isPublicPageEnabled(
  env.NEXT_PUBLIC_ENABLE_TEMPLATES_PAGES
)

/**
 * Is the public careers link enabled.
 */
export const isPublicCareersLinkEnabled = isPublicPageEnabled(env.NEXT_PUBLIC_ENABLE_CAREERS_LINK)

interface PublicLegalLinkConfig {
  href: string
  isExternal: boolean
}

/**
 * Resolves the auth-surface legal link destination.
 */
export function getAuthLegalLinkConfig({
  isLegalPagesEnabled,
  internalHref,
  externalHref,
}: {
  isLegalPagesEnabled: boolean
  internalHref: string
  externalHref?: string
}): PublicLegalLinkConfig | null {
  if (isLegalPagesEnabled) {
    return { href: internalHref, isExternal: false }
  }

  if (externalHref) {
    return { href: externalHref, isExternal: true }
  }

  return null
}

/**
 * Returns the auth-surface terms link destination or null when it should be hidden.
 */
export function getAuthTermsLinkConfig(): PublicLegalLinkConfig | null {
  return getAuthLegalLinkConfig({
    isLegalPagesEnabled: isPublicLegalPagesEnabled,
    internalHref: '/terms',
    externalHref: getEnv('NEXT_PUBLIC_TERMS_URL'),
  })
}

/**
 * Returns the auth-surface privacy link destination or null when it should be hidden.
 */
export function getAuthPrivacyLinkConfig(): PublicLegalLinkConfig | null {
  return getAuthLegalLinkConfig({
    isLegalPagesEnabled: isPublicLegalPagesEnabled,
    internalHref: '/privacy',
    externalHref: getEnv('NEXT_PUBLIC_PRIVACY_URL'),
  })
}

/**
 * Is React Grab enabled for UI element debugging
 * When true and in development mode, enables React Grab for copying UI element context to clipboard
 */
export const isReactGrabEnabled = isDev && isTruthy(env.REACT_GRAB_ENABLED)

/**
 * Is React Scan enabled for performance debugging
 * When true and in development mode, enables React Scan for detecting render performance issues
 */
export const isReactScanEnabled = isDev && isTruthy(env.REACT_SCAN_ENABLED)

/**
 * Returns the parsed allowlist of integration block types from the environment variable.
 * If not set or empty, returns null (meaning all integrations are allowed).
 */
export function getAllowedIntegrationsFromEnv(): string[] | null {
  if (!env.ALLOWED_INTEGRATIONS) return null
  const parsed = env.ALLOWED_INTEGRATIONS.split(',')
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : null
}

/**
 * Normalizes a domain entry from the ALLOWED_MCP_DOMAINS env var.
 * Accepts bare hostnames (e.g., "mcp.company.com") or full URLs (e.g., "https://mcp.company.com").
 * Extracts the hostname in either case.
 */
function normalizeDomainEntry(entry: string): string {
  const trimmed = entry.trim().toLowerCase()
  if (!trimmed) return ''
  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).hostname
    } catch {
      return trimmed
    }
  }
  return trimmed
}

/**
 * Get allowed MCP server domains from the ALLOWED_MCP_DOMAINS env var.
 * Returns null if not set (all domains allowed), or parsed array of lowercase hostnames.
 * Accepts both bare hostnames and full URLs in the env var value.
 */
export function getAllowedMcpDomainsFromEnv(): string[] | null {
  if (!env.ALLOWED_MCP_DOMAINS) return null
  const parsed = env.ALLOWED_MCP_DOMAINS.split(',').map(normalizeDomainEntry).filter(Boolean)
  return parsed.length > 0 ? parsed : null
}

/**
 * Get cost multiplier based on environment
 */
export function getCostMultiplier(): number {
  return isProd ? (env.COST_MULTIPLIER ?? 1) : 1
}
