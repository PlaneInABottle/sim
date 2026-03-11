# Sim Studio - AI Agent Reference

> **For development standards, architecture, and code style: See [CLAUDE.md](./CLAUDE.md)**

Visual AI workflow builder for creating and deploying agent workflows with drag-and-drop canvas.

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Workflow Concepts](#workflow-concepts)
- [Block System](#block-system)
- [Tools & Integrations](#tools--integrations)
- [LLM Providers](#llm-providers)
- [OAuth Services](#oauth-services)
- [MCP Operations](#mcp-operations)
- [Available Skills](#available-skills)
- [Agent Testing & Workflow Development](#agent-testing--workflow-development)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## Project Overview

**Sim Studio** is an open-source visual workflow builder for AI agents. Users design workflows on a canvas by connecting blocks (agents, tools, conditions, loops) with edges defining data flow and execution order.

```
apps/sim/           # Main Next.js application
├── blocks/         # Block definitions and registry
├── tools/          # Tool definitions (100+ integrations)
├── triggers/       # Webhook trigger definitions
├── providers/      # LLM provider integrations
├── executor/       # Workflow execution engine
└── stores/         # Zustand state management
```

---

## Deployment Context

> ⚠️ **Read this before making any architectural or billing-related decisions.**

This Sim Studio instance is **self-hosted, single-user**. The only user is the owner/operator.

| Fact | Detail |
|------|--------|
| **Hosting** | Render (Frankfurt region) |
| **Users** | 1 — the operator. No external end-users log into Sim |
| **Billing** | None. No Stripe, no subscriptions, no per-seat charges |
| **Workspaces** | 3 workspaces: `Ege's Workspace`, `Kamatas Workspace`, `Dynamic Config` |
| **Clients** | Each workspace corresponds to one Chatwoot account (one business client) |
| **Role** | Sim is used as an **AI workflow backend** — Chatwoot sends webhooks, Sim processes them |
| **Prod DB** | `$PROD_DATABASE_URL` in `apps/sim/.env` — Render PostgreSQL (Frankfurt) |

### Connecting to the Production Database

```bash
# Using the env var (recommended)
source apps/sim/.env && psql "$PROD_DATABASE_URL"

# Direct psql
psql "postgresql://sim_production_user:<password>@dpg-d5e0i83uibrs7397tp30-a.frankfurt-postgres.render.com/sim_production"
```

**Common production DB tasks:**
```sql
-- Check migration state
SELECT COUNT(*) FROM drizzle.__drizzle_migrations;
SELECT id, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;

-- Verify table existence (post-migration check)
SELECT to_regclass('public.credential_member'), to_regclass('public.workspace_budget');
```

> ⚠️ **Rebase remediation:** Drizzle uses `MAX(created_at)` as a watermark — entries with `folderMillis` ≤ that value are skipped. After a rebase, stale local migration rows have out-of-sequence timestamps and must all be deleted. Delete every row whose `created_at` exceeds the last legitimate upstream entry. If a deploy fails with `CREATE TRIGGER ... already exists`, drop the conflicting triggers before redeploying.

### What this means for agents

- **`getWorkspaceBilledAccountUserId`** and the billing/usage machinery in `processor.ts`, `preprocessing.ts`, etc. are **upstream open-source code**. Do not design new features around them as if we have multi-tenant billing.
- **`account` table** is Better Auth's OAuth login table (the operator's own login) — unrelated to client/tenant concepts.
- **Workspace = client**: when differentiating between Chatwoot clients, use `workspace_id`. There is no "tenant" layer above workspaces.
- **No Admin UI** for billing, limits, or subscription management is needed or wanted.
- When adding rate-limiting or budget features, scope them to `workspace_id` (not `user_id`, not a "tenant" table).

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Runtime | TypeScript, React 19, Next.js 16, Bun |
| Data | PostgreSQL, Drizzle ORM, pgvector |
| State | Zustand, React Query |
| Canvas | ReactFlow |
| Realtime | Socket.io |
| Testing | Vitest, @sim/testing |
| Packages | @sim/logger, @sim/db, @sim/testing |

---

## Workflow Concepts

### Data Flow Pattern

```
[TRIGGER/INPUT] → [PROCESS] → [OUTPUT]
```

### Block Output Syntax

Reference block outputs using angle brackets with block name:

```
<BlockName.outputField>
<Start.input>              # User input from chat
<Webhook 1.message>        # Webhook payload field
<Agent 1.content>          # Agent's text response
<API Block.response.data>  # Nested API response
```

### Template Variables

Use double braces in text/email blocks:

```
Subject: Status for {{Webhook 1.tracking_id}}
Body: Result: {{API Block.response.status}}
```

### Workflow Variables

```
Reference: <variable.varName>           # In block configs
Template:  {{variable.varName}}         # In text fields
Types: string | number | boolean | object | array | plain
```

---

## Block System

### Block Categories

| Category | Purpose |
|----------|---------|
| `triggers` | Entry points (`start_trigger`, `generic_webhook`, `schedule`) + service-specific triggers (`imap`, `rss`, `circleback`) |
| `blocks` | Core logic (agent, condition, router, function) |
| `tools` | Service integrations (slack, gmail, github) |

### Block Configuration (BlockConfig)

```typescript
interface BlockConfig {
  type: string                    // Block identifier
  name: string                    // Display name
  category: 'blocks' | 'tools' | 'triggers'
  bgColor: string                 // Hex color
  icon: BlockIcon                 // SVG component
  subBlocks: SubBlockConfig[]     // Configuration fields
  tools: {
    access: string[]              // Tool IDs this block uses
    config?: { tool: (params) => string }
  }
  inputs: Record<string, ParamConfig>
  outputs: Record<string, OutputFieldDefinition>
  triggers?: { enabled: boolean; available: string[] }
}
```

### SubBlock Types

Configuration field types for block settings:

| Type | Purpose |
|------|---------|
| `short-input` | Single line text |
| `long-input` | Multi-line text |
| `dropdown` | Select menu |
| `combobox` | Searchable dropdown |
| `code` | Code editor |
| `switch` | Toggle |
| `oauth-input` | OAuth credential selector |
| `tool-input` | Tool configuration |
| `condition-input` | Conditional logic |
| `file-selector` | File picker (Google Drive, etc.) |
| `channel-selector` | Channel picker (Slack, Discord) |

### Registered Blocks (181)

**Triggers (active):** `start_trigger`, `generic_webhook`, `schedule`, `imap`, `rss`, `circleback`  
**Triggers (legacy, hidden):** `api_trigger`, `chat_trigger`, `input_trigger`, `manual_trigger`

**Core:** `a2a`, `agent`, `api`, `condition`, `evaluator`, `function`, `guardrails`, `human_in_the_loop`, `knowledge`, `mcp`, `memory`, `note`, `parallel_ai`, `response`, `router_v2`, `starter`, `variables`, `wait`, `webhook_request`, `workflow_input`  
**Core (legacy, hidden):** `router`, `workflow`

**AI/LLM:** `openai`, `thinking`, `vision`, `image_generator`, `tts`, `stt`

**Communication:** `slack`, `discord`, `microsoft_teams`, `gmail`, `outlook`, `telegram`, `whatsapp`

**Productivity:** `notion`, `airtable`, `google_sheets`, `google_docs`, `google_drive`, `asana`, `linear`, `jira`, `trello`

**Data/Storage:** `postgresql`, `mongodb`, `mysql`, `dynamodb`, `s3`, `supabase`, `pinecone`, `qdrant`

**Search:** `exa`, `tavily`, `serper`, `duckduckgo`, `wikipedia`

**Web:** `firecrawl`, `jina`, `browser_use`, `stagehand`

> **Note on loop/parallel:** `loop` and `parallel` are subflow container types used by workflow state + `sim-mcp-update_subflow`; they are not registry block keys (`parallel_ai` is the registered block type).

### Valid Trigger Types (`execute_workflow.triggerType`)

`api` | `manual` | `schedule` | `chat` | `webhook` | `mcp` | `a2a`

---

## Tools & Integrations

### Tool Configuration (ToolConfig)

```typescript
interface ToolConfig<P, R> {
  id: string
  name: string
  description: string
  version: string
  oauth?: { required: boolean; provider: OAuthService }
  params: Record<string, {
    type: string
    required?: boolean
    visibility?: 'user-or-llm' | 'user-only' | 'llm-only' | 'hidden'
  }>
  request: {
    url: string | ((params) => string)
    method: HttpMethod
    headers: (params) => Record<string, string>
    body?: (params) => any
  }
  transformResponse?: (response: Response) => Promise<R>
  outputs?: Record<string, { type: string; description?: string }>
}
```

### Adding New Integrations

Required files:
1. `tools/{service}/` - Tool definitions + types
2. `blocks/blocks/{service}.ts` - Block configuration
3. `components/icons.tsx` - Service icon
4. `triggers/{service}/` - (Optional) Webhook handlers

Register in:
- `tools/registry.ts`
- `blocks/registry.ts`
- `triggers/registry.ts` (if triggers)

---

## LLM Providers

### Available Providers

| Provider | ID | Notes |
|----------|-----|-------|
| OpenAI | `openai` | GPT-4, GPT-4o, o1 |
| Anthropic | `anthropic` | Claude 3.5, Claude 4 |
| Google | `google` | Gemini models |
| Vertex AI | `vertex` | Google Cloud |
| Azure OpenAI | `azure-openai` | Enterprise |
| DeepSeek | `deepseek` | |
| xAI | `xai` | Grok |
| Groq | `groq` | Fast inference |
| Mistral | `mistral` | |
| Ollama | `ollama` | Local models |
| OpenRouter | `openrouter` | Multi-provider |
| vLLM | `vllm` | Self-hosted |
| Bedrock | `bedrock` | AWS |
| Cerebras | `cerebras` | |

### Provider Interface

```typescript
interface ProviderConfig {
  id: string
  name: string
  models: string[]
  defaultModel: string
  executeRequest: (request: ProviderRequest) => Promise<ProviderResponse>
}
```

---

## OAuth Services

### Google Services

| Service | Provider ID | Description |
|---------|------------|-------------|
| Gmail | `google-email` | Email automation |
| Google Drive | `google-drive` | File management |
| Google Docs | `google-docs` | Document operations |
| Google Sheets | `google-sheets` | Spreadsheet data |
| Google Calendar | `google-calendar` | Event scheduling |
| Google Forms | `google-forms` | Form responses |
| Vertex AI | `vertex-ai` | OAuth for Gemini |

### Microsoft Services

| Service | Provider ID |
|---------|------------|
| Outlook | `microsoft-email` |
| Teams | `microsoft-teams` |
| OneDrive | `microsoft-onedrive` |
| SharePoint | `microsoft-sharepoint` |
| Excel | `microsoft-excel` |
| Planner | `microsoft-planner` |

### Other OAuth Providers

`slack`, `discord`, `github`, `linear`, `notion`, `airtable`, `jira`, `confluence`, `hubspot`, `salesforce`, `shopify`, `spotify`, `zoom`, `reddit`, `linkedin`, `x`, `trello`, `webflow`, `wealthbox`, `pipedrive`

---

## MCP Operations

The `sim-mcp` server provides programmatic workflow management.

### Workflow Operations

```typescript
// List all available sim-mcp tools
sim-mcp-list_tools()

// Create a new workflow
sim-mcp-create_workflow({ name, workspaceId, description?, color?, folderId? })

// List workflows
sim-mcp-list_workflows({ workspaceId?, limit?, offset? })

// Get workflow details (verbose=true for full block config)
sim-mcp-get_workflow({ workflowId, verbose? })

// Replace entire workflow state
sim-mcp-replace_workflow_state({ workflowId, state })

// Execute a workflow (uses draft state by default — no deploy needed)
// triggerType: "api" | "manual" | "schedule" | "chat" | "webhook" | "mcp" | "a2a"
sim-mcp-execute_workflow({ workflowId, input?, triggerType?, useDraftState? })
```

### Execution Monitoring

```typescript
// List and filter execution logs
sim-mcp-get_execution_logs({ workspaceId, workflowId?, executionId?, level?, details?, includeTraceSpans?, includeFinalOutput?, limit?, cursor? })

// Get full detail for a specific execution log
sim-mcp-get_execution_log_detail({ logId })
```

### Block Operations

```typescript
// Add blocks with optional edges
sim-mcp-add_blocks({
  workflowId,
  blocks: [{ type, name, position, data?, enabled?, id? }],
  edges?: [{ source, target, sourceHandle?, targetHandle? }]
})

// Get full detail for a single block
sim-mcp-get_block({ workflowId, blockId })

// Remove blocks
sim-mcp-remove_blocks({ workflowId, blockIds: [] })

// Update block name
sim-mcp-update_block_name({ workflowId, blockId, name })

// Toggle enabled state
sim-mcp-toggle_block_enabled({ workflowId, blockId, enabled })

// Update subblock value
sim-mcp-update_subblock({ workflowId, blockId, subblockId, value })

// Set or remove block's parent container (for loop/parallel nesting)
sim-mcp-update_block_parent({ workflowId, blockId, parentId })
```

### Edge Operations

```typescript
// Connect blocks
sim-mcp-add_edge({ workflowId, source, target, sourceHandle?, targetHandle? })

// Remove connection
sim-mcp-remove_edge({ workflowId, edgeId })
```

### Variable Operations

```typescript
// Add workflow variable
sim-mcp-add_variable({ workflowId, name, type, value, id? })

// Remove variable
sim-mcp-remove_variable({ workflowId, variableId })
```

### Subflow Operations

```typescript
// Update loop/parallel configuration (create via add_blocks with type "loop"/"parallel")
sim-mcp-update_subflow({ workflowId, id, type?, config? })
```

### Custom Tools

```typescript
// List workspace custom tools (metadata only)
sim-mcp-list_custom_tools({ workspaceId?, workflowId? })

// Get full details for a specific custom tool
sim-mcp-get_custom_tool({ toolId, workspaceId?, workflowId? })

// Create/update custom tools
sim-mcp-upsert_custom_tools({
  workspaceId,
  tools: [{ title, schema, code, id? }]
})
```

### Skill Management

```typescript
// List all skills in a workspace
sim-mcp-list_skills({ workspaceId })

// Get full skill details by ID
sim-mcp-get_skill({ workspaceId, id })

// Create a new skill (name must be kebab-case)
sim-mcp-create_skill({ workspaceId, name, description, content })

// Update an existing skill
sim-mcp-update_skill({ workspaceId, id, name, description, content })

// Delete a skill (does NOT cascade — manually remove from agent blocks)
sim-mcp-delete_skill({ workspaceId, id })
```

> **Full parameter reference:** See `sim-workflows` skill → `references/mcp-tools-reference.md` for detailed parameter tables, return values, and usage examples for all 28 tools.

---

## Available Skills

Invoke with `skill` tool. Tier indicates when loading is mandatory vs recommended.

Repo-local skills under `.agents/skills/` are listed below. Externally loaded
authority skills such as `skill-maintainer` and `skill-creator` may still be
loaded when needed, but they are not part of this repository-owned inventory.

If you package a `.skill` archive for distribution, write it outside the live
tree (for example `./dist/skills`) instead of placing it under `.agents/skills/`.

| Tier | Skill | Use When |
|------|-------|----------|
| 🔥 Required | `sim-workflow-testing` | **ANY** workflow testing, debugging, trace inspection, or execution verification |
| ✅ Recommended | `kamatas-workflow-testing` | Kamatas-specific workflow inventory, IDs, and maintained scenario suite layered on the generic testing framework |
| 🔥 Required | `sim-workflows` | Building/modifying workflows via MCP (blocks, edges, variables) |
| 🔥 Required | `ikas-api` | Querying ikas e-commerce data (products, orders, customers via GraphQL) |
| ✅ Recommended | `db-migrations` | Dual-config Drizzle migration architecture, rebases, watermark debugging, production remediation |
| ✅ Recommended | `ecommerce-agent-template` | Creating WhatsApp/chat support agents for ikas companies (product browsing, order lookup, handoff) |
| ✅ Recommended | `ikas-products-grouping` | Product discovery tools with category grouping, color/dimension parsing for ikas stores |
| ✅ Recommended | `config-production-db` | Config_production database schema, tenant auth, runtime query flow |
| ✅ Recommended | `sim-app-development` | Repo-local app development touchpoints and integration checklist outside workflow-only or deployment work |
| ✅ Recommended | `sim-debugging` | Production debugging workflow for Render-hosted incidents, SSH/log access issues, and production Postgres execution/queue investigation |
| ✅ Recommended | `sim-runtime` | Starting/monitoring the Sim Studio dev environment |
| ✅ Recommended | `sim-self-hosting` | Self-hosting and deployment guidance for npm, Docker Compose, Render, Helm, and environment setup |
| ✅ Recommended | `trendyol-api` | Trendyol marketplace Q&A and approved-products API reference |
| ⚠️ Commands | `add-integration` / `add-block` / `add-tools` / `add-trigger` | Slash commands: `/add-integration`, `/add-block`, `/add-tools`, `/add-trigger` for workflow scaffolding |

---

## Agent Testing & Workflow Development

> 🔥 **CRITICAL:** Load `sim-workflow-testing` skill before any testing task — it contains the full protocol, payload templates, verification rules, and block management references.

### 3-Phase Testing Pattern

All custom tools and workflow changes **must** pass these phases:

**Phase 1 — Local JS Validation** (catches ~70% of issues at zero cost):
Copy custom tool code into standalone JS → mock inputs → run with Node/Bun → test edge cases (empty arrays, null fields, malformed input)

**Phase 2 — Isolated Workflow Testing** (SNAPSHOT → DISABLE → EXECUTE → VERIFY → RESTORE):
Snapshot block states → disable non-essential blocks → execute with crafted payload (`useDraftState: true`) → inspect `trace_spans` in execution logs → **always restore**, even on failure

**Phase 3 — Full Integration Testing:**
Enable all blocks (disable final sends if destructive) → send realistic payload → verify trace spans show correct routing + outputs → confirm final output format

### Testing Quick Reference

| Task | Action |
|------|--------|
| Test routing only | `CONDITION_ONLY` profile — disable all except trigger + conditions |
| Test one path | `PATH_ISOLATION` profile — enable only target-path blocks |
| Check block output | `get_execution_logs({ includeTraceSpans: true, details: "full" })` |
| Skip a block | `toggle_block_enabled(blockId, enabled=false)` |
| Verify tool output | Phase 1 JS first, then Phase 2 isolated execution |

### ⚠️ Anti-Patterns

| 🚫 Don't | ✅ Instead |
|-----------|-----------|
| Create parallel "test workflow" | **Disable blocks** in real workflow to isolate paths |
| Deploy to test changes | Use `useDraftState: true` (the default) |
| Modify block config during tests | Only toggle `enabled/disabled` — never change logic |
| Guess at tool output format | Run Phase 1 JS validation to verify output shape |
| Skip block restore after tests | Always restore from snapshot, even if tests fail |
| Batch-execute multiple scenarios | Test one at a time, verify, then proceed |

### Common Testing Scenarios

- **CR (Conversation Round):** Build webhook payload with user message → disable non-target blocks → execute → verify agent response + routing in trace spans
- **Custom Tool Isolation:** Phase 1 (local JS with mocks) → Phase 2 (disable agent, enable only tool block with hardcoded inputs) → verify output schema matches agent expectations
- **Media/File Handling:** Include attachment URLs in payload → verify media_type condition routes correctly → test with null attachments for fallback
- **Webhook Payload Validation:** Start from known-good template → override fields for edge cases → `CONDITION_ONLY` profile → check condition outputs in trace spans

---

## Common Patterns

```
Simple Agent:      start_trigger → agent → response
Conditional:       generic_webhook → router_v2 → [path_a → agent_a, path_b → agent_b] → response
API Integration:   start_trigger → api → function (parse) → agent → slack
RAG:               start_trigger → knowledge (retrieve) → agent (answer) → response
```

**Block Positioning:** 200-300px horizontal spacing, 50-100px vertical for branches, triggers left → responses right.

### Schema Format (Webhooks, APIs)

```json
{
  "fieldName": { "type": "string", "description": "Field description" },
  "nested": { "type": "object", "properties": { "id": { "type": "number" } } },
  "items": { "type": "array", "description": "Array of items" }
}
```

---

## Troubleshooting

### Workflow Issues

| Issue | Solution |
|-------|----------|
| "Block not found" | Call `get_workflow` to verify current state |
| "Invalid block type" | Check spelling in `blocks/registry.ts` |
| "Edge already exists" / "Circular dependency" | Cannot create duplicate or looping edges |
| Block output undefined | Verify block name matches exactly |

### Workflow Testing Issues

| Issue | Solution |
|-------|----------|
| Tool gives wrong output | 🔥 Load `sim-workflow-testing` → PATH_ISOLATION profile → check trace spans for actual vs expected |
| Can't verify custom tool logic | Phase 1 JS validation first, then Phase 2 isolated workflow. See [testing skill](.agents/skills/sim-workflow-testing/SKILL.md) |
| Block outputs wrong in trace | `get_execution_logs({ includeTraceSpans: true, details: "full" })` — each span shows block I/O |
| Condition routes wrong | `CONDITION_ONLY` profile — check condition outputs for branch selection |
| Blocks left disabled | Emergency restore: `toggle_block_enabled(enabled=true)` for all blocks |
| Test affects production | Verify `useDraftState: true`. Never deploy during tests. Restore blocks after |
| GraphQL error in ikas tool | Load `ikas-api` skill. Common: wrong fields on `SearchProductVariantType`, `search` vs `input` param |

### OAuth / Tool / MCP Issues

| Issue | Solution |
|-------|----------|
| Token expired | Re-authenticate via credential selector |
| Missing scopes / provider mismatch | Check `requiredScopes` and `oauth.provider` in tool config |
| API/transform error | Check request URL, headers, body; verify `transformResponse` edge cases |
| Import fails / state mismatch | Ensure complete JSON; use `get_workflow` before modifications |

---

## Quick Reference

```bash
bun run dev:full      # Development (app + sockets)
bun run build         # Production build
bun run test          # Run tests
bun run lint          # Lint code
```

```
blocks/registry.ts    # All registered blocks     providers/registry.ts  # All LLM providers
tools/registry.ts     # All registered tools      lib/oauth/oauth.ts     # OAuth provider configs
triggers/registry.ts  # All registered triggers
```

```typescript
import { getBlock } from '@/blocks/registry'
import { createLogger } from '@sim/logger'
import type { BlockConfig } from '@/blocks/types'
import type { ToolConfig } from '@/tools/types'
import type { ProviderConfig } from '@/providers/types'
```
