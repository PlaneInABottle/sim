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

When testing a new custom tool for the first time, start with the current
minimal draft-run path before full integration.

### Setup: Preferred Minimal Current-Surface Path

Use a minimal current-surface path with:
- **Active path:** `start_trigger` → Agent block (uses tool) → Response block  
  *(Legacy `api_trigger` may exist in older workflows but is hidden/deprecated.)*
- **Fallback only:** use the shared **PATH_ISOLATION** profile if the workflow cannot be exercised safely without low-level isolation

**Why:** Isolates the tool's behavior; eliminates noise from other agents/blocks; confirms tool works before trusting it with full routing.

### Phase 1: Tool Output Validation

1. Confirm the draft test path reaches trigger → agent → response without unrelated side effects
2. Execute the draft workflow with test input:
   ```
   run_workflow({
      workflowId: "<WORKFLOW_ID>",
      workflow_input: { mainCategory: "test-category" }
    })
   ```
3. Check execution logs:
   - ✓ Tool executed without errors
   - ✓ Output matches expected schema
   - ✓ Token count reasonable (compare to baseline)
4. Verify token savings (if tool is for optimization):
   ```
   cost_with_tool < cost_without_tool * 0.65  // e.g., 40% savings
   ```

### Phase 2: Agent Routing Validation

1. Keep the same current-surface path; add secondary routers/conditions only when validating tool choice
2. Execute realistic user messages:
   - "Show me products in X" → agent chooses tool
   - "What colors available?" → agent recalls previous response
   - Irrelevant message → agent doesn't call tool
3. Verify agent routing via trace spans:
   - Trace shows tool_call for relevant messages
   - No tool_call for irrelevant messages

### Phase 3: Full Integration

1. Execute end-to-end conversations
2. If you used a legacy fallback isolation profile, restore all toggled blocks to original state
3. Monitor cost/performance across multiple categories
4. Confirm tool reduces overall token usage

---

## Anti-Patterns: Workflow Testing

Common mistakes and their corrections:

### ❌ Anti-Pattern 1: Creating Parallel Test Workflows

**What it looks like:** Copy a live workflow → create a `- TEST COPY` variant → test on the copy.

**Why it fails:** Divergence, no confidence (changes haven't touched real workflow), maintenance burden.

**✓ Correct approach:** Use the current draft workflow-testing surface against the real workflow. If you truly need low-level isolation, treat PATH_ISOLATION as a documented fallback and restore immediately.

### ❌ Anti-Pattern 2: Manual Low-Level Block Disabling (No Restore Plan)

**What it looks like:** Manually toggle 15 blocks. Leave them disabled. Forget original state.

**Why it fails:** Drift, can't restore accurately, production workflow left partially disabled.

**✓ Correct approach:** Prefer the current draft workflow-testing surface. If you must use legacy block toggles, snapshot → isolate by profile → execute → restore.

### ❌ Anti-Pattern 3: Testing Without Verification

**What it looks like:** Execute → check no errors → assume success. Never verify output schema, routing, token usage.

**Why it fails:** Silent failures, token bloat, routing failures go undetected.

**✓ Correct approach:** Verify output schema. Check token usage vs baseline. Trace routing via trace spans. Use assertions, not manual review.

---

## Anti-Patterns: Custom Tools

### ❌ Anti-Pattern 1: Deploy Without Local Testing

**What it looks like:** Write logic in custom tool code field → run the full workflow immediately → hope it works.

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
| **4. Isolated Testing** | Use the minimal current draft path first; fall back to PATH_ISOLATION only when necessary |
| **5. Full Integration** | Expand to realistic routing, edge cases, and production-like monitoring |
| **6. Documentation** | Write docs with response schema, config options, token baseline, limitations |

---

## Checklist: New Custom Tool

- [ ] Local JS/Python test script created
- [ ] Transformation logic verified (grouping, parsing)
- [ ] Token savings measured and documented
- [ ] Edge cases tested (null, empty, invalid input)
- [ ] Tool created via the current custom-tool management surface
- [ ] Tool tested with the current minimal draft path (typically `start_trigger` → agent → response); use PATH_ISOLATION only as a low-level fallback
- [ ] Output schema validated (all fields present, correct types)
- [ ] Agent routing verified (when to use tool vs other paths)
- [ ] Error handling tested (invalid input, API failure)
- [ ] Full workflow tested with realistic conversations
- [ ] Documentation created with response schema, token baseline, limitations
- [ ] If reusable: skill created via skill-creator
