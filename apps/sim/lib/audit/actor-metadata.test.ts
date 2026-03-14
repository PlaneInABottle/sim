/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import { getAuditActorMetadata } from '@/lib/audit/actor-metadata'
import { AuthType } from '@/lib/auth/hybrid'

describe('getAuditActorMetadata', () => {
  it('preserves actor metadata for API key auth when present', () => {
    expect(
      getAuditActorMetadata({
        success: true,
        userId: 'api-user',
        userName: 'API Key Actor',
        userEmail: 'api@example.com',
        authType: AuthType.API_KEY,
      })
    ).toEqual({
      actorName: 'API Key Actor',
      actorEmail: 'api@example.com',
    })
  })

  it('returns undefined metadata when auth is missing', () => {
    expect(getAuditActorMetadata(null)).toEqual({
      actorName: undefined,
      actorEmail: undefined,
    })
  })
})
