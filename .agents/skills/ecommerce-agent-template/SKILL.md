---
name: ecommerce-agent-template
description: Reusable template for creating e-commerce support agent prompts for ikas-based companies. Use when (1) onboarding a new ikas e-commerce company that needs a WhatsApp/chat support agent, (2) creating or customizing an agent prompt with product browsing, order lookup, area-based pricing, dimension routing, measurement guidance, and human handoff, (3) adapting the proven Kamatas agent pattern to a different product domain. Covers all ikas tool integrations (ikas_browse, calculate_product_price, ikas_lookup_customer_orders, handoff_to_human).
---

# E-Commerce Agent Prompt Template

Reusable prompt template for ikas-based e-commerce support agents. Modeled on the Kamatas agent (repo root: `docs/prompts/kamatas-agent-prompt.md`).

## Workflow

### 1. Gather Company Information

Collect before generating:

- **Identity:** Company name, address, website domain, channel (WhatsApp/etc.)
- **Products:** Product families, category hierarchy, terminology glossary
- **Language:** Primary language, formality rules, natural phrases, name honorifics
- **Dimensions:** How customers specify sizes, dimension-to-product routing rules
- **Measurement:** Measurement method, tutorial video URLs (by product × scenario)
- **Pricing:** Currency, area-based product list (if any), out-of-stock label
- **Handoff:** Label taxonomy, special-case triggers, warm handoff phrases
- **Status translations:** Order/payment/package statuses in target language

### 2. Generate Prompt from Template

Read `references/template.md` — the complete prompt template with `{{PLACEHOLDER}}` markers.

Replace all placeholders using `references/placeholders.md` as a lookup table. Each placeholder has: description, Kamatas example value, and guidance.

### 3. Validate

1. Run `grep '{{' generated-prompt.md` — must return 0 matches
2. Verify all `<!-- CUSTOMIZE: -->` comments were addressed
3. Confirm prompt is under 500 lines
4. Check all handoff labels are consistent between sections

## Template Architecture

Three tiers — know what to preserve vs customize:

**Universal (never modify):**
- Memory-first rule, intent→tool routing table, **Decision Pipeline**
- calculate_product_price formula, UUID safety, **output & pricing guards**
- Hard rules (anti-hallucination), sanity checklist, one-question-per-message pattern
- 3-round handoff rule, 15-message goal

**Structural (keep pattern, change content):**
- Who You Are, Your Voice, Customer Recognition, First Message
- Product navigation hierarchy, dimension routing, measurement & installation
- Handoff categories, status translations, conversation examples

**Company-specific (fully custom):**
- Product families, terminology, videos, special-case triggers, dimension thresholds

## Deterministic Prompt Architecture

The template enforces a **single Decision Pipeline** — one ordered sequence that routes every customer message. This prevents conflicting or duplicate routing rules.

### Design Constraints

1. **Single pipeline, single truth:** All routing lives in the Decision Pipeline section. No routing logic duplicated elsewhere in the prompt.
2. **Precedence is explicit:** Memory → Dimension routing → Standard intent → Special-case fallback → Handoff. Standard routing always precedes special cases.
3. **Output guards are mandatory:** After `calculate_product_price`, only `finalPrice` reaches the customer. Internal fields (`unitPrice`, `originalUnitPrice`, `minimumPrice`, `originalMinimumPrice`, `pricingType`) are suppressed.
4. **Compact output by default:** One price per product, no raw JSON, no internal field names in customer-facing text.

### Validation Checks for Generated Prompts

After generating a prompt from the template:

1. **No duplicate routing:** Routing logic should only appear in the Decision Pipeline and Intent Routing sections — not scattered across conversation examples or hard rules.
2. **Precedence preserved:** The 5 pipeline steps must appear in order (1–5) with no inserted steps that skip standard routing.
3. **Suppressed fields enforced:** `unitPrice`, `originalUnitPrice`, `minimumPrice`, `originalMinimumPrice`, `pricingType` must never appear in customer-facing example dialogue.
4. **Placeholder completeness:** `grep '{{' prompt.md` returns 0 matches.
5. **Handoff label consistency:** Every label in conversation examples matches a label in the Handoff Labels block.
6. **No redundant reconfirmation:** When routing resolves an alternative (e.g., dimension routing selects kapı over pencere), the generated prompt must not re-ask the already-resolved routing question.

## Reference Files

- **`references/template.md`** — Complete prompt template with all `{{PLACEHOLDER}}` markers and `<!-- CUSTOMIZE: -->` comments. Read this to generate a new agent prompt.
- **`references/placeholders.md`** — All placeholders with descriptions, Kamatas examples, and fill-in guidance. Read this for the placeholder lookup table.

## Tool Configuration

Every ikas agent needs these four tools:

| Tool | ikas API | Purpose |
|------|----------|---------|
| `ikas_browse` | `listCategory` / `listProduct` (GraphQL) | Product discovery by category UUID |
| `calculate_product_price` | Custom JS function | Area pricing: `max(100×unitPrice, W×H×unitPrice/100)` |
| `ikas_lookup_customer_orders` | `listOrder` (GraphQL) | Order lookup by phone/email/orderNumber |
| `handoff_to_human` | Platform-specific | Human escalation with labels + internal_note |

Skip `calculate_product_price` if all products are fixed-price.

### OAuth Credential Setup (ikas)

If your agent uses ikas GraphQL-backed tools (`ikas_browse`, `ikas_lookup_customer_orders`), configure OAuth first:

1. Create an API application in the ikas merchant/admin panel.
2. Collect `client_id` and `client_secret`.
3. Store credentials in secure environment variables or secret storage (never hardcode in prompt text).
4. Obtain token via OAuth2 `client_credentials` grant from:
   - `https://<store>.myikas.com/api/admin/oauth/token`
5. Use returned bearer token for Admin GraphQL calls.

For full auth flow and token lifecycle details, see [ikas-api skill quick start](../ikas-api/SKILL.md#quick-start).

> **Rate limits:** ikas Admin API requests are rate-limited (currently 50 requests / 10 seconds). See [ikas-api rate limiting](../ikas-api/SKILL.md#rate-limiting) before production rollout.

> **Production note:** Kamatas replaces `ikas_browse` with `get_products_by_main_category` — a single-call tool returning all products grouped by type with `dims: "WxH"` strings and color variants. See the [ikas-products-grouping skill](../ikas-products-grouping/SKILL.md) for the grouping pattern. When using this tool, navigation simplifies from multi-step browsing to: customer says category → single tool call → filter and present results. The template uses `ikas_browse` as the generic fallback; customize the navigation section for your tool.

### Order Context Capture Pattern

When tools like `ikas_lookup_customer_orders` return data, **inject the results into agent memory** so the agent can reference them on subsequent turns without re-fetching from the ikas API.

#### Why This Matters

Without context capture, every follow-up question about orders (cargo status, payment details, tracking numbers) triggers a new API call. With capture, the agent remembers the customer's order data across the conversation — enabling natural multi-turn support.

#### Flow

```
┌─────────────────────┐
│ 1. Tool Call         │  Agent or router calls ikas_lookup_customer_orders(phone)
│    (ikas API)        │  → Returns order lookup data (raw ikas fields or your wrapper's normalized shape)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 2. Extract & Format │  extractSearchContext function block:
│    (Function Block)  │  - Reads <Tool Block.response>
│                      │  - Calls formatOrdersResult() to build readable text
│                      │  - Output: contextText (structured order summary)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 3. Store in Memory   │  storeIkasContext memory block:
│    (Memory Block)    │  - Injects contextText as role: "system" message
│                      │  - Agent slides this context across turns (24h+ window)
└────────┬────────────┘
         ▼
┌─────────────────────┐
│ 4. Agent Recalls     │  On next customer message, agent sees order context
│    (Agent Block)     │  in memory — answers cargo/status/tracking questions
│                      │  without re-querying ikas API
└─────────────────────┘
```

#### Code Pattern: `extractSearchContext` Block

The function block collects tool outputs and formats them into human-readable context text:

```javascript
// extractSearchContext — collects results from tool blocks
const CONFIG = {
  toolNames: [
    'ikas_browse',
    'ikas_lookup_customer_orders',
    'get_products_by_main_category',
    'calculate_product_price'
  ]
}

async function collectResults(blockInputs) {
  const results = {}
  for (const toolName of CONFIG.toolNames) {
    const block = blockInputs.find(b => b.blockName === toolName)
    if (block?.response) {
      if (toolName === 'ikas_lookup_customer_orders') {
        results.orderData = formatOrdersResult(block.response)
      }
      // Add similar handlers for other tools as needed
    }
  }
  return results
}

function formatOrdersResult(response) {
  const { customer, orders } = response
  let text = `[Order Lookup]\nCustomer: ${customer.fullName} (${customer.phone})\n`
  orders.forEach(o => {
    text += `Order #${o.orderNumber}: ${o.status}`
    text += ` | Payment: ${o.orderPaymentStatus}`
    text += ` | Package: ${o.orderPackageStatus}\n`
    // Append tracking info when available
    o.orderPackages?.forEach(p => {
      text += `  Tracking: ${p.trackingInfo?.trackingNumber} (${p.trackingInfo?.cargoCompany})`
      text += ` - ${p.orderPackageFulfillStatus}\n`
    })
  })
  return text
}

// Build final contextText from all collected results
function buildContextText(results) {
  const parts = []
  if (results.orderData) parts.push(results.orderData)
  // Add other result types here
  return parts.join('\n---\n')
}
```

#### Memory Injection: `storeIkasContext` Block

The memory block takes the formatted `contextText` and injects it into the agent's conversation memory:

| Setting | Value |
|---------|-------|
| **Input** | `contextText` (formatted order/product/search data from extract block) |
| **Operation** | `memory.set({ role: 'system', content: contextText }, compositeKey)` |
| **Retrieval** | Agent reads via sliding window on next turn — context persists across messages |
| **TTL** | 24h+ sliding window (configurable per deployment) |

The `compositeKey` should combine conversation ID + customer identifier to scope context per customer session. This pattern is most useful for order-history, cargo/tracking, and multi-order follow-up conversations.

#### Example: Kamatas PROD Agent Handling Cargo Query

```
Turn 1 — Customer: "Siparişim nerede? 05551234567"
  → ikas_lookup_customer_orders("05551234567") returns 3 orders
  → extractSearchContext formats: order numbers, statuses, tracking
  → storeIkasContext injects into memory

Turn 2 — Customer: "Kargo takip numaram ne?"
  → Agent sees in memory: Order #1042 Tracking: YK-123456 (Yurtiçi Kargo)
  → Responds directly: "Kargo takip numaranız: YK-123456 (Yurtiçi Kargo)"
  → No API call needed
```

> **Tip:** This pattern applies to any tool that returns data the agent may need across turns — not just order lookups. Product browsing results, price calculations, and customer profiles can all be captured the same way.

## Dimension Extraction & Product Filtering

### Dimension Extraction (Critical)

**When customer provides dimensions, ALWAYS extract them and use for filtering:**

```text
Customer: "80x180 menteşeli pencere"
Extract: {width: 80, height: 180}
Agent calls: get_products_by_main_category("sineklikler")
Agent filters: returned groups by dims field matching customer dimensions
```

> **Tool-specific dimension formats:**
> - `get_products_by_main_category` → `dims: "WxH"` string per group (e.g., `"70x130"`). Agent compares customer dimensions against this string.
> - `ikas_browse` → `dimensions: { width: { min, max, unit }, height: { min, max, unit } }` per product. Agent checks `dimensions.width.max` / `dimensions.height.max`.

**Turkish dimension patterns:**
- `80x180` or `80×180` → width: 80, height: 180
- `en 80 boy 180` → width: 80, height: 180
- `80 genişlik 180 yükseklik` → width: 80, height: 180
- Single number → ask which dimension

**Never pass `{width: 0, height: 0}`** - this disables filtering and returns all products.

### Cross-Category Routing

When dimensions don't fit requested category, check alternatives in the same results:

```text
Customer: "80×180 menteşeli pencere"
Agent calls: get_products_by_main_category("sineklikler")
Agent filters: menteşeli pencere groups → max dims ~70x150 (too small for 180cm height)
Agent checks: menteşeli kapı groups → kapı 90×210 (accommodates 80×180)
Agent suggests: "Pencere için bu boy fazla, kapı menteşelimizde tam uyması var: [link]"
```

**Dimension thresholds (Kamatas example):**
- Pencere (window): Typical max 70W × 130-150H cm
- Kapı (door): Typical max 100W × 220H cm

**Routing rule:** If customer says "pencere" but height > 150cm → filter for kapı products first.
