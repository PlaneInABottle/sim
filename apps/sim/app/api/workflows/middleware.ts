import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import {
  type ApiKeyAuthResult,
  authenticateApiKeyFromHeader,
  updateApiKeyLastUsed,
} from '@/lib/api-key/service'
import { type AuthResult, AuthType, checkHybridAuth } from '@/lib/auth/hybrid'
import { env } from '@/lib/core/config/env'
import { getActiveWorkflowRecord } from '@/lib/workflows/active-context'
import { authorizeWorkflowByWorkspacePermission, getWorkflowById } from '@/lib/workflows/utils'

const logger = createLogger('WorkflowMiddleware')

export interface ValidationResult {
  error?: { message: string; status: number }
  workflow?: any
  auth?: AuthResult
}

export interface WorkflowAccessOptions {
  requireDeployment?: boolean
  action?: 'read' | 'write' | 'admin'
  allowInternalSecret?: boolean
}

async function getValidatedWorkflow(workflowId: string): Promise<ValidationResult> {
  const activeWorkflow = await getActiveWorkflowRecord(workflowId)
  if (activeWorkflow) {
    return { workflow: activeWorkflow }
  }

  const workflow = await getWorkflowById(workflowId)
  if (!workflow) {
    return {
      error: {
        message: 'Workflow not found',
        status: 404,
      },
    }
  }

  if (!workflow.workspaceId) {
    return {
      error: {
        message:
          'This workflow is not attached to a workspace. Personal workflows are deprecated and cannot be accessed.',
        status: 403,
      },
    }
  }

  return {
    error: {
      message: 'Workflow not found',
      status: 404,
    },
  }
}

export async function validateWorkflowAccess(
  request: NextRequest,
  workflowId: string,
  options: boolean | WorkflowAccessOptions = true
): Promise<ValidationResult> {
  try {
    const normalizedOptions: WorkflowAccessOptions =
      typeof options === 'boolean' ? { requireDeployment: options } : options
    const requireDeployment = normalizedOptions.requireDeployment ?? true
    const action = normalizedOptions.action ?? 'read'
    const allowInternalSecret = normalizedOptions.allowInternalSecret ?? false

    if (!requireDeployment) {
      const auth = await checkHybridAuth(request, { requireWorkflowId: false })
      if (!auth.success || !auth.userId) {
        return {
          error: {
            message: auth.error || 'Unauthorized',
            status: 401,
          },
        }
      }

      const workflowResult = await getValidatedWorkflow(workflowId)
      if (workflowResult.error || !workflowResult.workflow) {
        return workflowResult
      }
      const workflow = workflowResult.workflow

      if (
        auth.authType === AuthType.API_KEY &&
        auth.apiKeyType === 'workspace' &&
        auth.workspaceId !== workflow.workspaceId
      ) {
        return {
          error: {
            message: 'Unauthorized: API key does not have access to this workspace',
            status: 403,
          },
        }
      }

      const authorization = await authorizeWorkflowByWorkspacePermission({
        workflowId,
        userId: auth.userId,
        action,
        workflow,
      })
      if (!authorization.allowed) {
        return {
          error: {
            message: authorization.message || 'Access denied',
            status: authorization.status,
          },
        }
      }

      return { workflow, auth }
    }

    if (requireDeployment) {
      const internalSecret = request.headers.get('X-Internal-Secret')
      const hasValidInternalSecret =
        allowInternalSecret && env.INTERNAL_API_SECRET && internalSecret === env.INTERNAL_API_SECRET

      let apiKeyHeader: string | null = null

      if (!hasValidInternalSecret) {
        for (const [key, value] of request.headers.entries()) {
          if (key.toLowerCase() === 'x-api-key' && value) {
            apiKeyHeader = value
            break
          }
        }

        if (!apiKeyHeader) {
          return {
            error: {
              message: 'Unauthorized: API key required',
              status: 401,
            },
          }
        }
      }

      const workflowResult = await getValidatedWorkflow(workflowId)
      if (workflowResult.error || !workflowResult.workflow) {
        return workflowResult
      }
      const workflow = workflowResult.workflow

      if (hasValidInternalSecret) {
        if (!workflow.isDeployed) {
          return {
            error: {
              message: 'Workflow is not deployed',
              status: 403,
            },
          }
        }

        return { workflow }
      }

      let validResult: ApiKeyAuthResult | null = null

      const workspaceResult = await authenticateApiKeyFromHeader(apiKeyHeader!, {
        workspaceId: workflow.workspaceId as string,
        keyTypes: ['workspace', 'personal'],
      })

      if (workspaceResult.success) {
        validResult = workspaceResult
      }

      if (!validResult) {
        return {
          error: {
            message: 'Unauthorized: Invalid API key',
            status: 401,
          },
        }
      }

      if (!workflow.isDeployed) {
        return {
          error: {
            message: 'Workflow is not deployed',
            status: 403,
          },
        }
      }

      if (validResult.keyId) {
        await updateApiKeyLastUsed(validResult.keyId)
      }

      return { workflow }
    }

    return {
      error: {
        message: 'Internal server error',
        status: 500,
      },
    }
  } catch (error) {
    logger.error('Validation error:', { error })
    return {
      error: {
        message: 'Internal server error',
        status: 500,
      },
    }
  }
}
