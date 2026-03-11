# Custom Tool Testing

Testing methodology for custom tools in Sim Studio workflows — isolated testing,
anti-patterns, development lifecycle, and checklists.

See `testing-protocol.md` for the core 6-phase workflow testing protocol.

---

## Table of Contents

1. [Isolated Testing Setup](#isolated-testing-setup)
2. [Anti-Patterns: Workflow Testing](#anti-patterns-workflow-testing)
3. [Anti-Patterns: Custom Tools](#anti-patterns-custom-tools)
4. [Custom Tool Development Lifecycle](#custom-tool-development-lifecycle)
5. [Checklist: New Custom Tool](#checklist-new-custom-tool)

---

## Isolated Testing Setup

When testing a new custom tool for the first time, use a restricted block configuration before full integration.

### Setup: Minimal PATH_ISOLATION Profile

Use the shared **PATH_ISOLATION** profile with:
- **Enabled:** `start_trigger` → Agent block (uses tool) → Response block  
  *(Legacy `api_trigger` may exist in older workflows but is hidden/deprecated.)*
- **Disabled:** All other blocks (routers, conditions, secondary agents, integrations)

**Why:** Isolates the tool's behavior; eliminates noise from other agents/blocks; confirms tool works before trusting it with full routing.

### Phase 1: Tool Output Validation

1. Snapshot workflow state
2. Disable all blocks except trigger → agent → response
3. Execute workflow with test input:
   ```
   sim-mcp-execute_workflow(
     workflowId="<WORKFLOW_ID>",
     input={ mainCategory: "test-category" },
     useDraftState=true
   )
   ```
4. Check execution logs:
   - ✓ Tool executed without errors
   - ✓ Output matches expected schema
   - ✓ Token count reasonable (compare to baseline)
5. Verify token savings (if tool is for optimization):
   ```
   cost_with_tool < cost_without_tool * 0.65  // e.g., 40% savings
   ```

### Phase 2: Agent Routing Validation

1. Keep tool enabled in agent block; enable secondary routers/conditions
2. Execute realistic user messages:
   - "Show me products in X" → agent chooses tool
   - "What colors available?" → agent recalls previous response
   - Irrelevant message → agent doesn't call tool
3. Verify agent routing via trace spans:
   - Trace shows tool_call for relevant messages
   - No tool_call for irrelevant messages

### Phase 3: Full Integration

1. Restore all blocks to original state
2. Execute end-to-end conversations
3. Monitor cost/performance across multiple categories
4. Confirm tool reduces overall token usage

---

## Anti-Patterns: Workflow Testing

Common mistakes and their corrections:

### ❌ Anti-Pattern 1: Creating Parallel Test Workflows

**What it looks like:** Copy a live workflow → create a `- TEST COPY` variant → test on the copy.

**Why it fails:** Divergence, no confidence (changes haven't touched real workflow), maintenance burden.

**✓ Correct approach:** Disable blocks in the real workflow. Test within same workflow state. Restore when done.

### ❌ Anti-Pattern 2: Manual Block Disabling (No Snapshots)

**What it looks like:** Manually toggle 15 blocks. Leave them disabled. Forget original state.

**Why it fails:** Drift, can't restore accurately, production workflow left partially disabled.

**✓ Correct approach:** Use `block_snapshots` table: snapshot → disable by profile → execute → restore from snapshot.

### ❌ Anti-Pattern 3: Testing Without Verification

**What it looks like:** Execute → check no errors → assume success. Never verify output schema, routing, token usage.

**Why it fails:** Silent failures, token bloat, routing failures go undetected.

**✓ Correct approach:** Verify output schema. Check token usage vs baseline. Trace routing via trace spans. Use assertions, not manual review.

---

## Anti-Patterns: Custom Tools

### ❌ Anti-Pattern 1: Deploy Without Local Testing

**What it looks like:** Write logic in custom tool code field → run execute_workflow → hope it works.

**Why it fails:** No feedback loop (30s per cycle), vague error messages, no validation.

**✓ Correct approach:** Create `test-tool.js` with mock data → `node test-tool.js` → verify → then deploy.

### ❌ Anti-Pattern 2: Testing Without Token Metrics

**What it looks like:** Tool works → deployed → costs double a week later.

**Why it fails:** No baseline, no optimization, late detection.

**✓ Correct approach:**
```javascript
const before = countTokens(flatProducts);
const after = countTokens(groupedProducts);
const savings = 100 * (1 - after / before);
// Expect > 30% for grouping tools
```

### ❌ Anti-Pattern 3: Modifying Tool Without Rollback Plan

**What it looks like:** Change schema → deploy immediately → agent breaks → no revert path.

**Why it fails:** Tight coupling, no testing, no rollback.

**✓ Correct approach:** Create v2 tool → test in isolation → verify all paths → retire v1 → keep fallback 24h.

---

## Custom Tool Development Lifecycle

When building a new custom tool for multiple companies or workflows:

| Phase | Activities |
|-------|-----------|
| **1. Design** | Define input params, output schema, edge cases, assumptions |
| **2. Local Testing** | Create test script, implement logic, verify grouping/parsing, measure tokens, run 5-10 test cases |
| **3. Create in Sim** | Implement in custom tool UI, handle errors gracefully, test with actual API |
| **4. Isolated Testing** | Disable all blocks except trigger → agent → response, verify output, check tokens |
| **5. Full Integration** | Re-enable all blocks, test agent routing, edge cases, monitor production |
| **6. Documentation** | Write docs with response schema, config options, token baseline, limitations |

---

## Checklist: New Custom Tool

- [ ] Local JS/Python test script created
- [ ] Transformation logic verified (grouping, parsing)
- [ ] Token savings measured and documented
- [ ] Edge cases tested (null, empty, invalid input)
- [ ] Tool created via sim-mcp-upsert_custom_tools
- [ ] Tool tested with a PATH_ISOLATION block set (trigger → agent → response only)
- [ ] Output schema validated (all fields present, correct types)
- [ ] Agent routing verified (when to use tool vs other paths)
- [ ] Error handling tested (invalid input, API failure)
- [ ] Full workflow tested with realistic conversations
- [ ] Documentation created with response schema, token baseline, limitations
- [ ] If reusable: skill created via skill-creator
