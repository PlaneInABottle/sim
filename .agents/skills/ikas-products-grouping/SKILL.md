---
name: ikas-products-grouping
description: Reusable pattern for creating category-based product discovery custom tools in Sim Studio workflows for ikas e-commerce storefronts. Use when building product browsing agents or integrating product data with grouping, color extraction, and token efficiency. Covers schema design, transformation logic (color/dimension parsing, variant grouping), testing workflow (JS → isolated → full integration), and customization for different stores. Works with any ikas-based company (Kamatas, etc.) to create get_products_by_main_category tools.
---

# ikas Products Grouping

## Overview

This skill provides a reusable pattern for creating custom tools that discover products by main category from ikas storefronts. The tool groups products by type + dimensions, extracts colors from product names, and returns a flattened schema optimized for token efficiency (40-60% smaller than flat lists).

**Use this skill when:**
- Building a new e-commerce agent for an ikas-based company
- Creating a product discovery tool that needs to group variants and save tokens
- Customizing the pattern for different stores, categories, or color schemes
- Understanding how to test and deploy custom tools safely

## Quick Example

Input: `mainCategory: "sineklikler"`  
Output:
```json
{
  "mainCategory": "Sineklikler",
  "totalProducts": 3,
  "totalGroups": 1,
  "groups": [
    {
      "type": "Akordeon DUBLE Kapı Sineklik",
      "price": 4621.5,
      "dims": "290x240",
      "variants": [
        { "color": "Antrasit", "url": "/..." },
        { "color": "Beyaz", "url": "/..." }
      ]
    }
  ]
}
```

## Core Pattern: Transform → Group → Flatten

### 1. Transform (Extract metadata from product names)

**Color extraction** (two-phase, multi-word aware — prevents substring bugs):
```javascript
// Multi-word colors checked FIRST (longest match wins, prevents "Gri" matching inside "Metalik Gri")
const KNOWN_COLORS_MULTI = ["Metalik Gri", "Ara Gri"];

// Single-word colors, scanned across ALL word positions (rightmost match preferred)
const KNOWN_COLORS_SINGLE = [
  "Beyaz", "Antrasit", "Altınmeşe", "Kahverengi", "Naturel",
  "Siyah", "Bronz", "Parlak", "Gri", "Krem",
  "Kırmızı", "Pudra", "Yeşil"
];

function extractColor(name) {
  const lower = trLower(name);  // Turkish-aware lowercase

  // Phase 1: Multi-word colors (must match before single-word to prevent partial matches)
  for (const color of KNOWN_COLORS_MULTI) {
    if (lower.includes(trLower(color))) return color;
  }

  // Phase 2: Single-word colors (rightmost match = most likely variant suffix)
  const tokens = name.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tokenClean = tokens[i].replace(/[,;.]+$/, '');
    for (const color of KNOWN_COLORS_SINGLE) {
      if (trLower(tokenClean) === trLower(color)) return color;
    }
  }

  return null;
}
```

**Base type extraction** (remove color suffix):
```javascript
function extractBaseType(name) {
  let baseName = name.trim();
  // Remove multi-word colors first, then single-word
  for (const color of [...KNOWN_COLORS_MULTI, ...KNOWN_COLORS_SINGLE]) {
    baseName = baseName.replace(new RegExp(`\\s*${color}\\s*$`, 'i'), "").trim();
  }
  return baseName;
}
```

**Dimension serialization** (optional fields, skip nulls):
```javascript
function serializeDims(dims) {
  if (!dims) return null;
  const w = dims.maxWidth ?? dims.width ?? dims.minWidth;
  const h = dims.maxHeight ?? dims.height ?? dims.minHeight;
  return w && h ? `${w}x${h}` : null;
}
```

### 2. Group

Group key = `baseType + (dims if available)`. Variants within group = different colors/prices.

Example grouping — **all same price → price hoisted to group** (3 products → 1 group):
```
Input:
  - "Akordeon DUBLE Kapı Sineklik Antrasit 290x240" → ₺4621.5
  - "Akordeon DUBLE Kapı Sineklik Beyaz 290x240" → ₺4621.5
  - "Akordeon DUBLE Kapı Sineklik Altınmeşe 290x240" → ₺4621.5

Output:
  {
    "type": "Akordeon DUBLE Kapı Sineklik",
    "dims": "290x240",
    "price": 4621.5,  // hoisted — all 3 variants have identical price (Set.size === 1)
    "variants": [
      { "color": "Antrasit", "url": "/..." },
      { "color": "Beyaz", "url": "/..." },
      { "color": "Altınmeşe", "url": "/..." }
    ]
  }
```

Example grouping — **mixed prices → price stays per-variant** (3 products → 1 group):
```
Input:
  - "Plise Sineklik Antrasit 150x220" → ₺3200
  - "Plise Sineklik Beyaz 150x220" → ₺3200
  - "Plise Sineklik Altınmeşe 150x220" → ₺3650

Output:
  {
    "type": "Plise Sineklik",
    "dims": "150x220",
    // no hoisted price — prices differ (Set.size === 2 > 1)
    "variants": [
      { "color": "Antrasit", "price": 3200, "url": "/..." },
      { "color": "Beyaz", "price": 3200, "url": "/..." },
      { "color": "Altınmeşe", "price": 3650, "url": "/..." }
    ]
  }
```

### 3. Flatten

- Absolute URLs → relative paths: `https://store.com/slug` → `/slug`
- Nested price object → scalar: `{ amount: 100 }` → `100`
- Optional fields → omit if null/undefined
- Result: ~40-60% token savings

## Implementation: Three Phases

See `references/testing-workflow.md` for the JS-first validation sequence plus the
current `validate_workflow` → `execute_workflow` draft-test workflow. Any older
fine-grained workflow-editing commands in that reference are explicitly marked
historical only.

### Phase 1: Local JS Test

Create `test-products.js` with:
1. Mock ikas API response
2. Call transformation functions
3. Verify grouping, color extraction, edge cases
4. Measure token count

**Run before touching Sim Studio.**

### Phase 2: Isolated Tool Test in Sim

1. Attach the custom tool through the current local workflow surface described in
   `sim-workflows`
2. Keep the draft verification path minimal: `start_trigger` → `agent` (with the
   new tool) → `response`
3. Run `validate_workflow` first, then test the draft workflow with `execute_workflow`
4. If the draft run fails, inspect `get_execution_logs` / `get_execution_log_detail`

### Phase 3: Full Integration

1. Return to the normal end-to-end draft workflow without relying on legacy
   block-toggle isolation steps
2. Test with realistic customer conversations
3. Check routing and prompt integration

## Customization for Your Store

Update these parts for your ikas store:

**1. Category Enum**
```javascript
enum: ["sineklikler", "perdeler", "otomatik-panjurlar", "profiller", "aksesuarlar", "tutamaklar"]  // Query ikas API once
```

**2. Color Palette**
```javascript
const colors = [
  "Beyaz", "Antrasit", "Altınmeşe", "Kahverengi", "Naturel",
  "Siyah", "Bronz", "Parlak", "Gri", "Krem",
  "Kırmızı", "Pudra", "Yeşil",
  "Metalik Gri", "Ara Gri"  // Multi-word colors: must check BEFORE single-word
];
```

**3. Dimension Fields**
```javascript
// Handle your product's dimension field names
const w = dims.maxWidth ?? dims.width ?? dims.minWidth;
const h = dims.maxHeight ?? dims.height ?? dims.minHeight;
```

**4. Environment Variables**
```
IKAS_CLIENT_ID          # ikas OAuth2 client ID
IKAS_CLIENT_SECRET      # ikas OAuth2 client secret
SALES_CHANNEL_ID        # Storefront sales channel UUID
STORE_BASE_URL          # e.g., https://kamatas.com
```

In Sim Studio custom tools, use template variable syntax: `{{IKAS_CLIENT_ID}}`, `{{IKAS_CLIENT_SECRET}}`

> **Multi-tenant naming convention:** In production deployments with multiple stores,
> env vars use a store-specific prefix instead of the generic `IKAS_*` names above.
> For example, the Kamatas store uses `KAMATAS_IKAS_CLIENT_ID`, `KAMATAS_IKAS_CLIENT_SECRET`,
> `KAMATAS_SALES_CHANNEL_ID`, and `KAMATAS_STORE_BASE_URL`.
> Always follow your deployment's naming convention — check existing Sim Studio
> workspace variables or `.env` files for the correct prefix.

## Deployment Note

- This pattern was originally derived from a Kamatas storefront workflow, but workflow IDs, tool IDs, and environment-specific timings are intentionally omitted here because they may be stale.
- Verify token savings and latency in your own execution logs after applying the pattern to your store.

## See Also

- `references/testing-workflow.md` — Complete testing workflow with code examples
- `references/schema.md` — Full API schema with all field definitions
