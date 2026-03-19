/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuthenticateApiKey, mockGetWorkspaceBillingSettings, mockGetUserEntityPermissions } =
  vi.hoisted(() => ({
    mockAuthenticateApiKey: vi.fn(),
    mockGetWorkspaceBillingSettings: vi.fn(),
    mockGetUserEntityPermissions: vi.fn(),
  }))

vi.mock('@/lib/api-key/auth', () => ({
  authenticateApiKey: (...args: unknown[]) => mockAuthenticateApiKey(...args),
}))

vi.mock('@/lib/workspaces/utils', () => ({
  getWorkspaceBillingSettings: (...args: unknown[]) => mockGetWorkspaceBillingSettings(...args),
}))

vi.mock('@/lib/workspaces/permissions/utils', () => ({
  getUserEntityPermissions: (...args: unknown[]) => mockGetUserEntityPermissions(...args),
}))

import { databaseMock } from '@sim/testing'
import { authenticateApiKeyFromHeader } from '@/lib/api-key/service'

const mockDb = databaseMock.db

describe('authenticateApiKeyFromHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetWorkspaceBillingSettings.mockResolvedValue({
      billedAccountUserId: 'billing-user',
      allowPersonalApiKeys: true,
    })
    mockGetUserEntityPermissions.mockResolvedValue({ permissionType: 'admin' })
  })

  function createAwaitableQuery<T>(rows: T[]) {
    return {
      where: vi.fn().mockResolvedValue(rows),
      then: (onFulfilled: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected),
    }
  }

  it('authenticates a valid key when the joined user row is missing', async () => {
    const rows = [
      {
        id: 'key-1',
        userId: 'user-1',
        userName: null,
        userEmail: null,
        workspaceId: 'ws-1',
        type: 'workspace',
        key: 'stored-key',
        expiresAt: null,
      },
    ]

    vi.mocked(mockDb.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue(createAwaitableQuery(rows)),
      }),
    } as any)
    mockAuthenticateApiKey.mockResolvedValue(true)

    const result = await authenticateApiKeyFromHeader('raw-key', {
      workspaceId: 'ws-1',
      keyTypes: ['workspace', 'personal'],
    })

    expect(result).toEqual({
      success: true,
      userId: 'user-1',
      userName: null,
      userEmail: null,
      keyId: 'key-1',
      keyType: 'workspace',
      workspaceId: 'ws-1',
    })
  })

  it('still scopes the authentication result by workspace', async () => {
    const rows = [
      {
        id: 'key-1',
        userId: 'user-1',
        userName: null,
        userEmail: null,
        workspaceId: 'ws-2',
        type: 'workspace',
        key: 'stored-key',
        expiresAt: null,
      },
    ]

    vi.mocked(mockDb.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue(createAwaitableQuery(rows)),
      }),
    } as any)
    mockAuthenticateApiKey.mockResolvedValue(true)

    const result = await authenticateApiKeyFromHeader('raw-key', {
      workspaceId: 'ws-1',
      keyTypes: ['workspace'],
    })

    expect(result).toEqual({ success: false, error: 'Invalid API key' })
  })
})
