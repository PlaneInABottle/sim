import { db } from '@sim/db'
import { permissions, workflow, workflowExecutionLogs } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, desc, eq, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getExecutionStatusContract } from '@/lib/logs/execution/status-contract'
import {
  buildFilterConditions,
  buildLogsLevelCondition,
  LogFilterParamsSchema,
} from '@/lib/logs/filters'
import { isExecutionFinalizationPath, type RawExecutionStatus } from '@/lib/logs/types'

const logger = createLogger('LogsExportAPI')

export const revalidate = 0

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const params = LogFilterParamsSchema.parse(Object.fromEntries(searchParams.entries()))

    const selectColumns = {
      id: workflowExecutionLogs.id,
      workflowId: workflowExecutionLogs.workflowId,
      executionId: workflowExecutionLogs.executionId,
      level: workflowExecutionLogs.level,
      status: workflowExecutionLogs.status,
      finalizationPath: sql<
        string | null
      >`${workflowExecutionLogs.executionData}->>'finalizationPath'`,
      trigger: workflowExecutionLogs.trigger,
      startedAt: workflowExecutionLogs.startedAt,
      endedAt: workflowExecutionLogs.endedAt,
      totalDurationMs: workflowExecutionLogs.totalDurationMs,
      cost: workflowExecutionLogs.cost,
      executionData: workflowExecutionLogs.executionData,
      workflowName: sql<string>`COALESCE(${workflow.name}, 'Deleted Workflow')`,
    }

    const workspaceCondition = eq(workflowExecutionLogs.workspaceId, params.workspaceId)
    const levelCondition = params.level ? buildLogsLevelCondition(params.level) : undefined
    const filterConditions = buildFilterConditions(params, { useSimpleLevelFilter: false })
    const conditions = and(workspaceCondition, levelCondition, filterConditions)

    const header = [
      'startedAt',
      'level',
      'status',
      'rawStatus',
      'finalizationPath',
      'workflow',
      'trigger',
      'durationMs',
      'costTotal',
      'workflowId',
      'executionId',
      'message',
      'traceSpans',
    ].join(',')

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        controller.enqueue(encoder.encode(`${header}\n`))
        const pageSize = 1000
        let offset = 0
        try {
          while (true) {
            const rows = await db
              .select(selectColumns)
              .from(workflowExecutionLogs)
              .leftJoin(workflow, eq(workflowExecutionLogs.workflowId, workflow.id))
              .innerJoin(
                permissions,
                and(
                  eq(permissions.entityType, 'workspace'),
                  eq(permissions.entityId, workflowExecutionLogs.workspaceId),
                  eq(permissions.userId, userId)
                )
              )
              .where(conditions)
              .orderBy(desc(workflowExecutionLogs.startedAt))
              .limit(pageSize)
              .offset(offset)

            if (!rows.length) break

            for (const r of rows as any[]) {
              let message = ''
              let traces: any = null
              const executionStatusContract = getExecutionStatusContract({
                rawStatus: r.status as RawExecutionStatus,
                finalizationPath: isExecutionFinalizationPath(r.finalizationPath)
                  ? r.finalizationPath
                  : undefined,
              })
              try {
                const ed = (r as any).executionData
                if (ed) {
                  if (ed.finalOutput)
                    message =
                      typeof ed.finalOutput === 'string'
                        ? ed.finalOutput
                        : JSON.stringify(ed.finalOutput)
                  if (ed.message) message = ed.message
                  if (ed.traceSpans) traces = ed.traceSpans
                }
              } catch {}
              const line = [
                escapeCsv(r.startedAt?.toISOString?.() || r.startedAt),
                escapeCsv(r.level),
                escapeCsv(executionStatusContract.status),
                escapeCsv(executionStatusContract.rawStatus),
                escapeCsv(r.finalizationPath ?? ''),
                escapeCsv(r.workflowName),
                escapeCsv(r.trigger),
                escapeCsv(r.totalDurationMs ?? ''),
                escapeCsv(r.cost?.total ?? r.cost?.value?.total ?? ''),
                escapeCsv(r.workflowId ?? ''),
                escapeCsv(r.executionId ?? ''),
                escapeCsv(message),
                escapeCsv(traces ? JSON.stringify(traces) : ''),
              ].join(',')
              controller.enqueue(encoder.encode(`${line}\n`))
            }

            offset += pageSize
          }
          controller.close()
        } catch (e: any) {
          logger.error('Export stream error', { error: e?.message })
          try {
            controller.error(e)
          } catch {}
        }
      },
    })

    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `logs-${ts}.csv`

    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    logger.error('Export error', { error: error?.message })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
