import type { AuthResult } from '@/lib/auth/hybrid'

export function getAuditActorMetadata(auth: AuthResult | null | undefined): {
  actorName: string | undefined
  actorEmail: string | undefined
} {
  if (auth?.authType !== 'session') {
    return {
      actorName: undefined,
      actorEmail: undefined,
    }
  }

  return {
    actorName: auth.userName ?? undefined,
    actorEmail: auth.userEmail ?? undefined,
  }
}
