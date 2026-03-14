import type { AuthResult } from '@/lib/auth/hybrid'

export function getAuditActorMetadata(auth: AuthResult | null | undefined): {
  actorName: string | undefined
  actorEmail: string | undefined
} {
  if (!auth) {
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
