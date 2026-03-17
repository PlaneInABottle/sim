# Tag Reference Patterns

Tag resolution anti-patterns, GraphQL validation errors, custom tool schema best practices,
and pre-deployment checklists for Sim Studio workflows.

---

## Table of Contents

1. [Tag Reference Anti-Patterns](#critical-tag-reference-anti-patterns)
2. [GraphQL Schema Validation Errors](#graphql-schema-validation-errors)
3. [Custom Tool Schema Best Practices](#custom-tool-schema-best-practices)
4. [Pre-Deployment Checklist](#mandatory-pre-deployment-checklist)
5. [How to Debug Tag Reference Errors](#how-to-debug-tag-reference-errors)

---

## Critical: Tag Reference Anti-Patterns

**Recent production and debugging work surfaced these patterns — avoid these mistakes:**

### Anti-Pattern 1: JSDoc Comments with `<>` Tag Syntax ❌ CRITICAL

**Problem:** Tag resolver has **no comment awareness**. It finds `<BlockName.field>` anywhere in code, including comments and strings.

```javascript
// BAD - Tag in JSDoc comment gets resolved
/**
 * Fetches orders for customer
 * Input: <IkasTokenManager.result.token>, <FormatCustomerResponse.result.customer.id>
 */
const orders = await fetchOrders(token, customerId);
```

**Fix:** Use plain text in comments, not `<>` syntax:

```javascript
// GOOD - Plain text, not parsed
/**
 * Fetches orders for customer
 * Input: IkasTokenManager.result.token, FormatCustomerResponse.result.customer.id
 */
const token = <IkasTokenManager.result.token>;        // ← Real tag, safe
const customerId = <FormatCustomerResponse.result>?.customer?.id;  // ← Shallow tag + guard
```

### Anti-Pattern 2: Deep Nested Paths Without Guards ❌ HIGH

```javascript
// BAD - 9 errors from this pattern
const customerId = <FormatCustomerResponse.result.customer.id>;

// GOOD - Shallow tag + optional chaining
const customerData = <FormatCustomerResponse.result>;
const customerId = customerData?.customer?.id;
```

**Lesson:** Tags are shallow (one level). Stop before nullable objects. Guard with `?.` operator.

### Anti-Pattern 3: Wrong Nested Webhook Field Assumptions ❌ HIGH

```javascript
// BAD - 8 errors from payload structure mismatches
const conversationId = <Webhook 1.conversation.id>;

// GOOD - Fallback chain handles multiple payload shapes
const payload = <Webhook 1>;
const conversationId = payload?.conversation?.id
  || payload?.conversation_id
  || payload?.id
  || 'unknown';
```

**Lesson:** Webhook payloads are unpredictable. Build fallback chains.

### Anti-Pattern 4: Wrong Block Display Names in Tags ❌ HIGH

```javascript
// BAD - Block display name is "Support Agent", not "supportagent"
const toolCalls = <supportagent.toolCalls>;  // ← Won't resolve

// GOOD - Matches block display name exactly
const toolCalls = <Support Agent.toolCalls>;
```

**Lesson:** Display names are case-sensitive. Check the UI. When in doubt, read the workflow via `get_workflow`.

### Anti-Pattern 5: Invalid Condition Syntax with Tags ❌ MEDIUM

```javascript
// BAD - Leaves raw <> in JS expression → syntax error
if (<Extract Search Context.result.hasContext>) { ... }

// GOOD - Tag resolves to boolean value, then compared
<Extract Search Context.result.hasContext> === true
```

**Lesson:** Conditions are JavaScript. Tags resolve to values before JS sees them. Don't quote or wrap tags.

### Tag Resolution Inside SQL Strings

Tags resolve correctly inside multi-line SQL/CTE queries.

✅ **CORRECT:**
```sql
WHERE workspace_id = '<variable.WORKSPACE_ID>'
  AND conversation_id = '<Webhook 1.input.conversation.id>'
```

This is safe and expected. Tags are resolved **before** query validation/execution.

### ⚠️ Writing Multi-line SQL/Code Through the Workflow Editor

When writing a `query` or `code` field through the current workflow-editing
surface, **always use real newline characters** in the tool call — never `\n`
escape sequences.

XML tool parameters do **not** interpret `\n` as a newline — it becomes a literal backslash-n. This causes:
- **SQL:** CTE validator regex `/^(with)\s+/i` fails → query rejected before execution
- **JavaScript:** `//` comments have no real line terminator → the comment swallows everything after it

```
✅ Pass value with actual line breaks (multi-line XML content)
❌ Pass value with \n escape sequences — stored as literal backslash-n
```

> If you encounter older docs that frame `update_subblock` as the default editor,
> treat that as legacy fine-grained guidance rather than the current workflow surface.

---

## GraphQL Schema Validation Errors

Use this section when Sim workflow blocks call ikas GraphQL endpoints and fail with HTTP 400 validation errors.

### Error Pattern: Nested Variant Type Shape in `searchProducts`

**Observed error:**
```
Cannot query field "id" on type "SearchProductVariantType"
```

**Why:** `searchProducts` returns `productVariantTypes` as `SearchProductVariantType`, which has different fields than `listProduct` types.

### Correct vs Incorrect Query Examples

```graphql
# ❌ Incorrect (will fail validation)
productVariantTypes {
  id
  name
  values { id name }
}
```

```graphql
# ✅ Correct for searchProducts
productVariantTypes {
  order
  variantType { id name }
  variantValueIds
}
```

### How to Identify GraphQL Validation Errors Fast

1. Check HTTP status (often `400`) and inspect GraphQL `errors[].message`.
2. Look for messages starting with `Cannot query field ... on type ...`.
3. Match the failing type in ikas docs, not assumptions from similarly named types.
4. Verify whether field exists directly on the type or under a nested child object.

### Prevention Checklist

- [ ] For every new query field, confirm it on the exact ikas GraphQL type definition.
- [ ] Treat `search*` types as potentially different from `list*` types.
- [ ] Avoid flattening nested fields unless schema explicitly allows it.
- [ ] Keep TS response interfaces synchronized with query selections.
- [ ] When errors mention `Cannot query field`, fix schema mismatch first (before retry logic).

---

## Custom Tool Schema Best Practices

### AI-Readable Tool Descriptions

**Tool schema descriptions must be explicit — LLMs read them to understand usage.**

**BAD (vague):**
```json
"dimensions": {
  "description": "Optional W×H in cm",
  "properties": {
    "width": {"type": "number"},
    "height": {"type": "number"}
  }
}
```

**GOOD (explicit):**
```json
"dimensions": {
  "description": "Customer's opening dimensions in cm. REQUIRED when customer provides dimensions (e.g., '80x180', 'en 80 boy 180'). Used to filter products: strictFit (≥ requested), toleranceFit (0-2cm smaller), excluded (too small). Omit only when not specified yet.",
  "properties": {
    "width": {"type": "number", "description": "Width in cm (en). Opening width that product must cover."},
    "height": {"type": "number", "description": "Height in cm (boy). Opening height that product must cover."}
  }
}
```

**Key differences:**
- ✅ States when parameter is REQUIRED
- ✅ Gives examples in customer's language
- ✅ Explains what the parameter does (filtering logic)
- ✅ Clarifies field meanings (width = en, height = boy)
- ✅ Explains when to omit

### Dimension Filtering Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Agent passes `{width: 0, height: 0}` | Disables filtering | Schema must say "REQUIRED when customer provides dimensions" |
| Products with `dimensions: null` in strictFit | False positives | Separate `unknownDimensions` bucket |
| Suggesting products with unparsed dimensions | Wrong products recommended | Add slug parsing patterns, exclude when too small |
| No cross-category fallback | Customer needs kapı but only searched pencere | Add height/width thresholds + routing rules |

---

## Mandatory Pre-Deployment Checklist

Before **committing or deploying** a workflow, verify:

- [ ] **No `<>` in comments or strings** — Search code for `<` + review all JSDoc blocks
- [ ] **All block display names are exact** — Compare against UI names; case matters
- [ ] **All nested references have guards** — Use `?.` operator for any optional/nullable field
- [ ] **Webhook payload shapes are handled** — Use fallback chains for field alternatives
- [ ] **Condition syntax is valid JS** — Ensure conditions are executable before tag resolution
- [ ] **Run `validate_workflow` before execution** — Catch broken edges, connectivity/reachability issues, unused variables, and locally provable handle problems early
- [ ] **Execute with test payload first** — Run the draft workflow with `execute_workflow` before deploying; review execution logs and trace spans
- [ ] **Verify trace shows expected fields** — Inspect actual block outputs before wiring downstream references

---

## How to Debug Tag Reference Errors

When you see: `"result.customer.id" doesn't exist on block "FormatCustomerResponse"`

1. **Inspect the draft workflow:** start with `get_workflow({ workflowId })` and
   compare the block display names and wiring used by the failing tag
2. **Check output schema:** What fields does the block actually declare? (for function blocks: always `{result, stdout}`)
3. **Run structural preflight:** `validate_workflow({ workflowId })`
4. **Run a test:** `execute_workflow({ workflowId, input: testPayload, useDraftState: true })` against the draft workflow
5. **Inspect trace:** use `get_execution_logs(...)` / `get_execution_log_detail(...)` to inspect what each block actually outputs
6. **Compare:** Does the tag reference match what the block actually produces?
7. **Fix:** Adjust tag to match actual output; add guards for nullable fields
