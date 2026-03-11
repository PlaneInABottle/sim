# Verification Rules

Use these generic assertion patterns to verify workflow test executions without
hard-coding company-owned IDs or language fixtures.

---

## Assertion Types

### 1. Path Assertions

Verify which blocks executed:

```text
ASSERT: trace_block_names CONTAINS ["Webhook", "Route By Type"]
ASSERT: trace_block_names NOT_CONTAINS ["Final Send"]
ASSERT: trace_block_count EQUALS 3
```

### 2. Condition Assertions

Verify condition decisions:

```text
ASSERT: block("Route By Type").conditionResult EQUALS true
ASSERT: block("Route By Type").selectedOption CONTAINS "if"
ASSERT: block("Budget Gate").selectedOption EQUALS "<EXPECTED_HANDLE>"
```

Use exact block display names from the workflow under test.

### 3. Status Assertions

Verify block and execution status:

```text
ASSERT: block("Media Handoff").status EQUALS "success"
ASSERT: execution.status EQUALS "success"
```

### 4. Output Assertions

Verify returned payloads or block outputs:

```text
ASSERT: block("Media Handoff").output.result.success EQUALS true
ASSERT: block("Support Agent").output.content NOT_EMPTY
ASSERT: final_output CONTAINS "<EXPECTED_TEXT>"
```

---

## Profile Expectations

### CONDITION_ONLY

- trace should stay short
- only trigger + condition blocks should execute
- no side-effecting blocks should appear

### PATH_ISOLATION

- only the selected path should execute
- destructive downstream blocks should stay disabled unless explicitly under test
- expected trace should name the branch blocks in order

### FULL_INTEGRATION

- allow longer traces
- disable final sends when the integration is destructive
- compare both intermediate block output and final workflow output

---

## Output Semantics

Use expectations that match the workflow under test:

- **Condition blocks** — inspect `conditionResult` and `selectedOption`
- **Function/API blocks** — inspect `output` and error fields
- **Agent blocks** — inspect generated content or tool-call traces
- **Memory/database blocks** — verify persisted side effects separately when needed

For media workflows, assert on structured output fields such as media type, success
flags, and operation counts instead of company-specific phrasing.

---

## Failure Detection

Treat any of the following as a failed verification:

- expected block missing from trace
- unexpected destructive block executed
- condition selected the wrong branch
- execution level is `error`
- required output fields are absent or malformed

When a failure occurs, capture:

1. execution ID
2. failing block name
3. expected vs actual path
4. exact error text

---

## Workflow-Specific Handles

Do not hard-code condition handles in this generic file. Record them in the
workflow-specific inventory you build with `block-management.md` or in a
workflow-specific wrapper skill.
