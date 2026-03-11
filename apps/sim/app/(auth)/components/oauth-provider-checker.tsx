import { env } from '@/lib/core/config/env'
import { isHosted, isProd } from '@/lib/core/config/feature-flags'

export async function getOAuthProviderStatus() {
  // For self-hosted deployments, disable OAuth providers
  if (!isHosted) {
    return { githubAvailable: false, googleAvailable: false, isProduction: isProd }
  }

  const githubAvailable = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)

  const googleAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)

  return { githubAvailable, googleAvailable, isProduction: isProd }
}
