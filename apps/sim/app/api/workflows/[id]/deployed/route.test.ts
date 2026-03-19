/**
 * @vitest-environment node
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockValidateWorkflowAccess = vi.fn()
const mockVerifyInternalToken = vi.fn()
const mockLoadDeployedWorkflowState = vi.fn()

vi.mock('@sim/logger', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/app/api/workflows/middleware', () => ({
  validateWorkflowAccess: (...args: unknown[]) => mockValidateWorkflowAccess(...args),
}))

vi.mock('@/lib/auth/internal', () => ({
  verifyInternalToken: (...args: unknown[]) => mockVerifyInternalToken(...args),
}))

vi.mock('@/lib/core/utils/request', () => ({
  generateRequestId: () => 'req-123',
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadDeployedWorkflowState: (...args: unknown[]) => mockLoadDeployedWorkflowState(...args),
}))

import { GET } from '@/app/api/workflows/[id]/deployed/route'

describe('Workflow deployed-state route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyInternalToken.mockResolvedValue({ valid: false })
    mockLoadDeployedWorkflowState.mockResolvedValue({
      blocks: {},
      edges: [],
      loops: {},
      parallels: {},
      variables: [],
    })
  })

  it('uses hybrid workflow access when request is not internal bearer auth', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({ workflow: { id: 'wf-1' } })

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployed', {
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await GET(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(200)
    expect(mockValidateWorkflowAccess).toHaveBeenCalledWith(req, 'wf-1', {
      requireDeployment: false,
      action: 'read',
    })
  })

  it('returns 500 when deployed-state loading throws', async () => {
    mockValidateWorkflowAccess.mockResolvedValue({ workflow: { id: 'wf-1' } })
    mockLoadDeployedWorkflowState.mockRejectedValue(new Error('load failed'))

    const req = new NextRequest('http://localhost:3000/api/workflows/wf-1/deployed', {
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await GET(req, { params: Promise.resolve({ id: 'wf-1' }) })

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe(
      'no-store, no-cache, must-revalidate, max-age=0'
    )
  })
})
