# Kamatas PROD — Test Suite

Test scenarios for the repo-local Kamatas PROD workflow snapshot
(`98c363ef-febc-42cc-82d2-d40b501c5b56`). Re-check the current workflow before
assuming block count, enabled state, or scenario coverage still matches.

Use the current `sim_test` / `run_workflow` verification surface first. The
block-disable notes in this file are repo-maintained low-level fallback guidance
for older/manual isolation runs, not the default current workflow-testing path.

**Workspace:** `ac7ec7a6-f09a-4035-8e96-e9e95b75221b`
**Snapshot Block Count:** 25 (all enabled when this note was captured)
**Repo-Maintained Priority Scenarios:** 8 (see [Extending the Suite](#extending-the-suite) for pattern to add more)

---

## Table of Contents

1. [Block Map (Quick Reference)](#block-map-quick-reference)
2. [Test Group 1: Condition Routing](#test-group-1-condition-routing)
3. [Test Group 2: Budget System](#test-group-2-budget-system)
4. [Test Group 3: Media Handoff](#test-group-3-media-handoff)
5. [Test Group 4: Full Integration](#test-group-4-full-integration)
6. [Legacy Block Disable Profiles](#legacy-block-disable-profiles)
7. [Legacy Fallback Execution Order](#legacy-fallback-execution-order)
8. [Extending the Suite](#extending-the-suite)

---

## Block Map (Quick Reference)

See `block-management.md` for the full 25-block map, edge map, and Mermaid diagram.

Key blocks referenced in test scenarios:

| Block Name | Block ID | Type |
|------------|----------|------|
| webhook | `51aa80c7-1069-42d6-8388-f0cc5752b3eb` | generic_webhook |
| routeByType | `5023fc47-0d49-4537-a52b-56a77dc8a806` | condition |
| budgetCheck | `3b8fdfa3-2b40-4894-b152-49cdac832312` | postgresql |
| budgetGate | `budget-gate-block` | condition |
| budgetHandoff | `budget-handoff-block` | function |
| buildCompositeKey | `671c26a9-6a32-4a13-ae39-0b6b8c812548` | function |
| fetchCustomerInformation | `de351053-4c79-4447-82f9-9a62ce0c05fb` | function |
| storeUserMessage | `64f58486-0985-455b-87a6-f7169fd6fc88` | memory |
| setLatestMessageId | `upstash-set-latest` | upstash |
| debounceWait | `6ccc8ba7-9d9b-491c-a1cf-f7431a9a1082` | wait |
| getLatestMessageId | `upstash-get-latest-1` | upstash |
| checkIfTheMessageLatest | `403b0102-11a6-4e5f-a11e-e26690b4d366` | condition |
| agentLoop | `7d348632-e652-449c-9edc-705fb2d3843f` | loop |
| supportAgent | `8c62c360-a32a-48a7-8bf6-59f2e82f9415` | agent |
| isMediaMessage | `ba283aa5-f95a-444f-91b6-677ad0ba0a5d` | condition |
| mediaHandoff | `2ce4b876-b88f-4d04-86ee-d7f32bc766de` | function |
| sendToChatwoot | `bdfbabc1-9c37-4b94-97b1-eb1cfc54edf6` | function |

### Condition Handles

| Condition Block | IF Handle | ELSE Handle |
|----------------|-----------|-------------|
| routeByType | `condition-9dd96cb8-c79f-4ebb-82b0-f767ec7365f0-if` | `condition-9dd96cb8-c79f-4ebb-82b0-f767ec7365f0-else` |
| budgetGate | `condition-budget-gate-if` | `condition-budget-gate-else` |
| isMediaMessage | `condition-block-9f9c16f6-da15-4e56-a08a-2a036e48832a-if` | (implicit else / dropped) |
| checkIfTheMessageLatest | `condition-6c9c86c3-b760-4afe-94a1-54aeffac67b5-if` | (implicit else) |

---

## Test Group 1: Condition Routing

**Profile:** CONDITION_ONLY (legacy low-level fallback)
**Purpose:** Verify that routeByType and isMediaMessage conditions route messages correctly.
**Cost:** $0.00 per scenario

### CR-01: Text Greeting → Text Path (via Budget)

| Field | Value |
|-------|-------|
| **Scenario ID** | CR-01 |
| **Input** | `message_type: "incoming"`, `content: "Merhaba"`, `attachments: []` |
| **Expected Routing** | routeByType → IF (text path) → budgetCheck |
| **Expected Trace** | `["webhook", "routeByType"]` |
| **Condition Assertions** | `routeByType.conditionResult = true`, `routeByType.selectedOption CONTAINS "if"` |
| **Notes** | Most common message type. Incoming text triggers the IF path which leads to budgetCheck → budgetGate. With CONDITION_ONLY profile, only the routeByType condition executes (budgetCheck is a postgresql block, disabled). This expected trace is for the legacy fallback path; on the default current path the run continues into budgetCheck. |

### CR-02: Product Inquiry → Text Path

| Field | Value |
|-------|-------|
| **Scenario ID** | CR-02 |
| **Input** | `message_type: "incoming"`, `content: "Kedi filesi var mı?"`, `attachments: []` |
| **Expected Routing** | routeByType → IF (text path) |
| **Expected Trace** | `["webhook", "routeByType"]` |
| **Condition Assertions** | `routeByType.conditionResult = true` |
| **Notes** | Product search text — same routing as greeting. Content only matters at the supportAgent stage. This expected trace is for the legacy fallback path; on the default current path the run continues into budgetCheck. |

### CR-03: Voice Message → Media Path

| Field | Value |
|-------|-------|
| **Scenario ID** | CR-03 |
| **Input** | `message_type: "incoming"`, `content: ""`, `attachments: [{ "file_type": "audio", "data_url": "https://example.com/voice.ogg" }]` |
| **Expected Routing** | routeByType → ELSE → isMediaMessage → IF (media path) |
| **Expected Trace** | `["webhook", "routeByType", "isMediaMessage"]` |
| **Condition Assertions** | `routeByType.conditionResult = false`, `isMediaMessage.conditionResult = true` |
| **Notes** | Audio attachment triggers ELSE on routeByType (not incoming text), then IF on isMediaMessage. This expected trace is for the legacy fallback path; on the default current path a successful media route continues to mediaHandoff. |

### CR-04: Outgoing Message → Dropped

| Field | Value |
|-------|-------|
| **Scenario ID** | CR-04 |
| **Input** | `message_type: "outgoing"`, `content: "Size nasıl yardımcı olabilirim?"`, `attachments: []` |
| **Expected Routing** | routeByType → ELSE → isMediaMessage → ELSE (dropped) |
| **Expected Trace** | `["webhook", "routeByType", "isMediaMessage"]` |
| **Condition Assertions** | `routeByType.conditionResult = false`, `isMediaMessage.conditionResult = false` |
| **Notes** | Outgoing messages must be silently dropped. Both conditions reject. |

---

## Test Group 2: Budget System

**Profile:** PATH_ISOLATION (budget path, legacy low-level fallback)
**Purpose:** Verify the budget check/gate/handoff pipeline for conversation quota enforcement.
**Cost:** $0.00 per scenario (postgresql + condition blocks only, no AI agent)

### Setup: Budget State Configuration

Budget testing requires specific database states. The budget tables live in the
app database schema, not `config_production`. Use `db-migrations` plus
`packages/db/schema.ts` / `packages/db/local-migrations/0000_create_budget_tables.sql`
for table provenance, then verify state via read-only SQL queries:

```sql
-- Read-only verification query (do NOT use UPDATE for test setup)
SELECT
    w.workspace_id,
    w.conversation_limit,
    w.is_enabled,
    COUNT(c.id) AS used
FROM workspace_budget w
LEFT JOIN chatwoot_conversation_consumptions c
    ON c.workspace_id = w.workspace_id
WHERE w.workspace_id = 'ac7ec7a6-f09a-4035-8e96-e9e95b75221b'
GROUP BY w.workspace_id, w.conversation_limit, w.is_enabled;
```

> **Important:** This verification query intentionally does **not** filter by
> month; the repo schema documents a flat limit with no monthly reset. If it
> returns zero rows, the workspace is in the documented fail-open "no budget
> row" state. Modify budget state via the operational API or the current
> workflow/configuration management surface, not direct SQL.

### BG-01: Budget Available — Conversation Allowed

| Field | Value |
|-------|-------|
| **Scenario ID** | BG-01 |
| **Precondition** | `conversation_limit = 500`, `used = 0`, `is_enabled = true` |
| **Input** | Standard incoming text: `content: "Merhaba"`, `message_type: "incoming"` |
| **Expected Routing** | routeByType → IF → budgetCheck → budgetGate → IF (allowed) → buildCompositeKey |
| **Expected Trace** | `["webhook", "routeByType", "budgetCheck", "budgetGate", "buildCompositeKey", ...]` |
| **Condition Assertions** | `routeByType.conditionResult = true`, `budgetGate.conditionResult = true`, `budgetGate.selectedOption = "condition-budget-gate-if"` |
| **budgetCheck Output** | `rows[0].allowed = true` (CTE returns allowed=true when used < limit) |
| **Notes** | Happy path. Budget has ample capacity. Message proceeds to normal text pipeline. |

### BG-02: Budget Exceeded — Conversation Blocked

| Field | Value |
|-------|-------|
| **Scenario ID** | BG-02 |
| **Precondition** | `conversation_limit = 5`, `used = 5`, `is_enabled = true` |
| **Input** | Standard incoming text: `content: "Merhaba"`, `message_type: "incoming"` |
| **Expected Routing** | routeByType → IF → budgetCheck → budgetGate → ELSE (exceeded) → budgetHandoff |
| **Expected Trace** | `["webhook", "routeByType", "budgetCheck", "budgetGate", "budgetHandoff"]` |
| **Condition Assertions** | `budgetGate.conditionResult = false`, `budgetGate.selectedOption = "condition-budget-gate-else"` |
| **budgetCheck Output** | `rows[0].allowed = false` (CTE returns allowed=false when used >= limit) |
| **budgetHandoff Output** | Function returns handoff payload for human escalation |
| **Notes** | Quota exhausted. Message is blocked and escalated. budgetHandoff sends a "quota exceeded" response via Chatwoot. |

### BG-03: Budget Disabled — Fail-Open (All Allowed)

| Field | Value |
|-------|-------|
| **Scenario ID** | BG-03 |
| **Precondition** | `is_enabled = false` (regardless of limit/used values) |
| **Input** | Standard incoming text: `content: "Merhaba"`, `message_type: "incoming"` |
| **Expected Routing** | routeByType → IF → budgetCheck → budgetGate → IF (allowed) → buildCompositeKey |
| **Expected Trace** | `["webhook", "routeByType", "budgetCheck", "budgetGate", "buildCompositeKey", ...]` |
| **Condition Assertions** | `budgetGate.conditionResult = true` |
| **budgetCheck Output** | `rows[0].allowed = true` (CTE returns allowed=true when is_enabled=false) |
| **Notes** | Fail-open design. When budget system is disabled, all conversations are allowed regardless of consumption. This is the safety default — disabling the feature never blocks customers. |

---

## Test Group 3: Media Handoff

**Profile:** PATH_ISOLATION (media path, legacy low-level fallback)
**Purpose:** Verify the mediaHandoff function block processes media messages correctly.
**Cost:** $0.00–0.01 per scenario (function block only, no AI agent)

### Legacy Block Disable List (fallback only)

If you intentionally use legacy block-state isolation, disable all text/budget path blocks (keep media path enabled):

```python
disable_blocks = [
    "3b8fdfa3-2b40-4894-b152-49cdac832312",           # budgetCheck
    "budget-gate-block",                                # budgetGate
    "budget-handoff-block",                             # budgetHandoff
    "671c26a9-6a32-4a13-ae39-0b6b8c812548",           # buildCompositeKey
    "de351053-4c79-4447-82f9-9a62ce0c05fb",           # fetchCustomerInformation
    "64f58486-0985-455b-87a6-f7169fd6fc88",           # storeUserMessage
    "upstash-set-latest",                              # setLatestMessageId
    "6ccc8ba7-9d9b-491c-a1cf-f7431a9a1082",           # debounceWait
    "upstash-get-latest-1",                            # getLatestMessageId
    "403b0102-11a6-4e5f-a11e-e26690b4d366",           # checkIfTheMessageLatest
    "7d348632-e652-449c-9edc-705fb2d3843f",           # agentLoop
    "8c62c360-a32a-48a7-8bf6-59f2e82f9415",           # supportAgent
    "fc659ff0-be78-4ed5-ac74-e8d20e023b29",           # agentVariable
    "01c4f59f-11ef-4669-8070-f3bad2448011",           # errorWait
    "upstash-get-latest-2",                            # getLatestMessageId2
    "38f4065f-7a60-4002-b3ed-0ede1988ee21",           # checkIfTheMessageLatest2
    "65b23e14-a1db-4a41-ae62-7a36f4f8957e",           # extractSearchContext
    "453d7dc6-900d-4d7e-adcd-acada210b69d",           # hasIkasContext
    "44ad0de5-fd46-4a36-ac32-91b48fc23e89",           # storeIkasContext
    "42f0e0cc-3a91-4449-ac39-6f61a993b3a7",           # conversationHistory
    "bdfbabc1-9c37-4b94-97b1-eb1cfc54edf6",           # sendToChatwoot
]

keep_blocks = [
    "51aa80c7-1069-42d6-8388-f0cc5752b3eb",           # webhook
    "5023fc47-0d49-4537-a52b-56a77dc8a806",           # routeByType
    "ba283aa5-f95a-444f-91b6-677ad0ba0a5d",           # isMediaMessage
    "2ce4b876-b88f-4d04-86ee-d7f32bc766de",           # mediaHandoff
]
```

### MH-01: Voice Message Handoff

| Field | Value |
|-------|-------|
| **Scenario ID** | MH-01 |
| **Input** | Voice message (audio attachment, `file_type: "audio"`) |
| **Expected Trace** | `["webhook", "routeByType", "isMediaMessage", "mediaHandoff"]` |
| **Condition Assertions** | `routeByType.conditionResult = false`, `isMediaMessage.conditionResult = true` |
| **Output Assertions** | `mediaHandoff.output.result.mediaType EQUALS "voice"`, `mediaHandoff.output.result.success IS BOOLEAN`, `mediaHandoff.output.result.operations IS ARRAY` |
| **Notes** | Core voice handoff test. Audio attachment triggers media path and Chatwoot status toggle. |

---

## Test Group 4: Full Integration

**Profile:** FULL_INTEGRATION (current end-to-end profile)
**Purpose:** End-to-end test with real AI agent. Validates complete text pipeline.
**Cost:** $0.01–0.05 per scenario (AI tokens consumed)

### Legacy Block Disable List (fallback only)

If you intentionally use the low-level fallback, only disable the final send block:

```python
disable_blocks = [
    "bdfbabc1-9c37-4b94-97b1-eb1cfc54edf6",           # sendToChatwoot
]

keep_blocks = [
    # All other 24 blocks
]
```

### FI-01: Full Text Flow — Greeting

| Field | Value |
|-------|-------|
| **Scenario ID** | FI-01 |
| **Input** | `content: "Merhaba"`, standard incoming text |
| **Expected Trace** | `["webhook", "routeByType", "budgetCheck", "budgetGate", "buildCompositeKey", "fetchCustomerInformation", "storeUserMessage", "setLatestMessageId", "debounceWait", "getLatestMessageId", "checkIfTheMessageLatest", "agentLoop", "supportAgent", "agentVariable", "getLatestMessageId2", "checkIfTheMessageLatest2", "extractSearchContext", "hasIkasContext", "conversationHistory"]` |
| **Output Assertions** | `supportAgent.output.content` is a Turkish greeting, mentions Kamatas |
| **Status Assertions** | All blocks: `status = "success"` |
| **Notes** | Most expensive test. Validates full end-to-end behavior. **Parallel execution:** buildCompositeKey fans out to fetchCustomerInformation and storeUserMessage in parallel — trace may show them in either order. **Conditional trace:** If fetchCustomerInformation returns ikas data, `storeIkasContext` appears between `hasIkasContext` and `conversationHistory`. On the default current path, `sendToChatwoot` may appear after `conversationHistory`; the listed trace reflects the no-final-send variant. |

---

## Legacy Block Disable Profiles

Historical low-level fallback summary of which blocks to disable for each test profile, using full block IDs.

### Profile: CONDITION_ONLY

Disable 22 blocks, keep 3:

```python
# Blocks to KEEP ENABLED (conditions + trigger only)
keep_blocks = [
    "51aa80c7-1069-42d6-8388-f0cc5752b3eb",           # webhook
    "5023fc47-0d49-4537-a52b-56a77dc8a806",           # routeByType
    "ba283aa5-f95a-444f-91b6-677ad0ba0a5d",           # isMediaMessage
]

# Blocks to DISABLE (all non-condition blocks)
disable_blocks = [
    "3b8fdfa3-2b40-4894-b152-49cdac832312",           # budgetCheck (postgresql)
    "budget-gate-block",                                # budgetGate (condition — but budget-specific)
    "budget-handoff-block",                             # budgetHandoff
    "671c26a9-6a32-4a13-ae39-0b6b8c812548",           # buildCompositeKey
    "de351053-4c79-4447-82f9-9a62ce0c05fb",           # fetchCustomerInformation
    "64f58486-0985-455b-87a6-f7169fd6fc88",           # storeUserMessage
    "upstash-set-latest",                              # setLatestMessageId
    "6ccc8ba7-9d9b-491c-a1cf-f7431a9a1082",           # debounceWait
    "upstash-get-latest-1",                            # getLatestMessageId
    "403b0102-11a6-4e5f-a11e-e26690b4d366",           # checkIfTheMessageLatest
    "7d348632-e652-449c-9edc-705fb2d3843f",           # agentLoop
    "8c62c360-a32a-48a7-8bf6-59f2e82f9415",           # supportAgent
    "fc659ff0-be78-4ed5-ac74-e8d20e023b29",           # agentVariable
    "01c4f59f-11ef-4669-8070-f3bad2448011",           # errorWait
    "upstash-get-latest-2",                            # getLatestMessageId2
    "38f4065f-7a60-4002-b3ed-0ede1988ee21",           # checkIfTheMessageLatest2
    "65b23e14-a1db-4a41-ae62-7a36f4f8957e",           # extractSearchContext
    "453d7dc6-900d-4d7e-adcd-acada210b69d",           # hasIkasContext
    "44ad0de5-fd46-4a36-ac32-91b48fc23e89",           # storeIkasContext
    "42f0e0cc-3a91-4449-ac39-6f61a993b3a7",           # conversationHistory
    "bdfbabc1-9c37-4b94-97b1-eb1cfc54edf6",           # sendToChatwoot
    "2ce4b876-b88f-4d04-86ee-d7f32bc766de",           # mediaHandoff
]
```

### Profile: PATH_ISOLATION — Budget

Disable 20 blocks, keep 5 (webhook + routeByType + budgetCheck + budgetGate + budgetHandoff):

```python
keep_blocks = [
    "51aa80c7-1069-42d6-8388-f0cc5752b3eb",           # webhook
    "5023fc47-0d49-4537-a52b-56a77dc8a806",           # routeByType
    "3b8fdfa3-2b40-4894-b152-49cdac832312",           # budgetCheck
    "budget-gate-block",                                # budgetGate
    "budget-handoff-block",                             # budgetHandoff
]
# Disable all other 20 blocks
```

### Legacy fallback variant: FULL_INTEGRATION

Disable 1 block, keep 24:

```python
disable_blocks = [
    "bdfbabc1-9c37-4b94-97b1-eb1cfc54edf6",           # sendToChatwoot
]
# Keep all other 24 blocks
```

---

## Legacy Fallback Execution Order

Recommended order only if you intentionally run the legacy block-isolation suite:

```
Phase 1: CONDITION_ONLY (4 scenarios: CR-01 through CR-04)
├── Cheapest ($0.00), safest
├── Validates routeByType + isMediaMessage routing
└── If any fail → STOP, fix routing before proceeding

Phase 2: PATH_ISOLATION — Budget (3 scenarios: BG-01 through BG-03)
├── Low cost ($0.00), tests budget CTE + condition
├── Validates budgetCheck → budgetGate → budgetHandoff pipeline
└── If any fail → check postgresql CTE query or budget DB state

Phase 3: PATH_ISOLATION — Media (1 scenario: MH-01)
├── Low cost ($0.00–0.01)
├── Validates mediaHandoff function
└── If fail → check mediaHandoff function code

Phase 4: FULL_INTEGRATION (1 scenario: FI-01)
├── Highest cost ($0.01–0.05)
├── Validates end-to-end text pipeline with AI agent
└── Run only after Phases 1–3 pass
```

**Total:** 8 priority scenarios
**Estimated Cost:** $0.01–0.05 for full suite
**Estimated Time:** 5–10 minutes

---

## Extending the Suite

This test suite covers the 8 most critical scenarios. To add more, follow this pattern:

### Scenario Template

```markdown
#### XX-NN: <Descriptive Name>

| Field | Value |
|-------|-------|
| **Scenario ID** | XX-NN |
| **Input** | `message_type: "..."`, `content: "..."`, `attachments: [...]` |
| **Expected Routing** | <block> → <IF/ELSE> → <block> → ... |
| **Expected Trace** | `["webhook", "routeByType", ...]` |
| **Condition Assertions** | `<block>.conditionResult = true/false` |
| **Notes** | Why this scenario matters. |
```

### Suggested Additional Scenarios

| ID | Name | Group | Purpose |
|----|------|-------|---------|
| CR-05 | Image message → media path | condition_routing | Verify image routing |
| CR-06 | Document attachment → dropped | condition_routing | Verify file_type="file" is not media |
| CR-07 | Empty message → dropped | condition_routing | Edge case: no text, no attachments |
| CR-08 | Team-assigned → dropped | condition_routing | Team conversations bypass bot |
| MH-02 | Image handoff | media_handoff | Verify image media type in output |
| MH-03 | Video handoff | media_handoff | Verify video media type in output |
| TF-01 | Text pipeline (agent disabled) | text_flow | Validate ingestion pipeline only |
| OL-01 | Order lookup (phone + cargo) | integration | Verify ikas order tool calls |

### Block ID Reference for New Scenarios

All block IDs are in `block-management.md`. Key IDs for constructing disable lists:

```python
# Copy-paste ready: all 25 block IDs
ALL_BLOCK_IDS = [
    "51aa80c7-1069-42d6-8388-f0cc5752b3eb",   # webhook
    "5023fc47-0d49-4537-a52b-56a77dc8a806",   # routeByType
    "3b8fdfa3-2b40-4894-b152-49cdac832312",   # budgetCheck
    "budget-gate-block",                        # budgetGate
    "budget-handoff-block",                     # budgetHandoff
    "671c26a9-6a32-4a13-ae39-0b6b8c812548",   # buildCompositeKey
    "de351053-4c79-4447-82f9-9a62ce0c05fb",   # fetchCustomerInformation
    "64f58486-0985-455b-87a6-f7169fd6fc88",   # storeUserMessage
    "upstash-set-latest",                      # setLatestMessageId
    "6ccc8ba7-9d9b-491c-a1cf-f7431a9a1082",   # debounceWait
    "upstash-get-latest-1",                    # getLatestMessageId
    "403b0102-11a6-4e5f-a11e-e26690b4d366",   # checkIfTheMessageLatest
    "7d348632-e652-449c-9edc-705fb2d3843f",   # agentLoop
    "8c62c360-a32a-48a7-8bf6-59f2e82f9415",   # supportAgent
    "fc659ff0-be78-4ed5-ac74-e8d20e023b29",   # agentVariable
    "01c4f59f-11ef-4669-8070-f3bad2448011",   # errorWait
    "upstash-get-latest-2",                    # getLatestMessageId2
    "38f4065f-7a60-4002-b3ed-0ede1988ee21",   # checkIfTheMessageLatest2
    "65b23e14-a1db-4a41-ae62-7a36f4f8957e",   # extractSearchContext
    "453d7dc6-900d-4d7e-adcd-acada210b69d",   # hasIkasContext
    "44ad0de5-fd46-4a36-ac32-91b48fc23e89",   # storeIkasContext
    "42f0e0cc-3a91-4449-ac39-6f61a993b3a7",   # conversationHistory
    "bdfbabc1-9c37-4b94-97b1-eb1cfc54edf6",   # sendToChatwoot
    "ba283aa5-f95a-444f-91b6-677ad0ba0a5d",   # isMediaMessage
    "2ce4b876-b88f-4d04-86ee-d7f32bc766de",   # mediaHandoff
]
```
