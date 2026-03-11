# Testing Workflow

## Phase 1: Local JavaScript Test (Before Sim Studio)

Create a standalone test script to validate transformation logic without touching the UI.

> **Default mode (recommended): single file.**
> Paste Sections **1.1 → 1.4** into one `test-products.js` file and run it directly.
>
> **Optional split-file mode:** If you want separate files, create:
> - `mock-data.js` — Section 1.1
> - `transformations.js` — Section 1.2
> - `grouping.js` — Section 1.3
> - `test-products.js` — Section 1.4  
> and add `module.exports` / `require()` lines as needed.

### 1.1 Mock ikas Response

```javascript
// mock-data.js (or top of test-products.js in single-file mode)
const mockProducts = [
  {
    id: "prod-1",
    name: "Akordeon DUBLE Kapı Sineklik Antrasit",
    metaData: { slug: "akordeon-duble-kapi-sineklik-antrasit-maximum-290x240" },
    baseUnit: null,
    attributes: [],
    variants: [
      {
        isActive: true,
        prices: [{ sellPrice: 4621.5, discountPrice: null, currency: "TRY" }],
        images: [{ imageId: "img-001", fileName: "sineklik-1.jpg", isMain: true }]
      }
    ]
  },
  {
    id: "prod-2",
    name: "Akordeon DUBLE Kapı Sineklik Beyaz",
    metaData: { slug: "akordeon-duble-kapi-sineklik-beyaz-maximum-290x240" },
    baseUnit: null,
    attributes: [],
    variants: [
      {
        isActive: true,
        prices: [{ sellPrice: 4621.5, discountPrice: null, currency: "TRY" }],
        images: [{ imageId: "img-002", fileName: "sineklik-2.jpg", isMain: true }]
      }
    ]
  },
  {
    id: "prod-3",
    name: "Akordeon DUBLE Kapı Sineklik Altınmeşe",
    metaData: { slug: "akordeon-duble-kapi-sineklik-altinmese-maximum-290x240" },
    baseUnit: null,
    attributes: [],
    variants: [
      {
        isActive: true,
        prices: [{ sellPrice: 5220, discountPrice: null, currency: "TRY" }],
        images: [{ imageId: "img-003", fileName: "sineklik-3.jpg", isMain: true }]
      }
    ]
  },
  // ... more products
];
```

### 1.2 Transformation Functions

> **Prerequisite — Slug-to-Dims Parsing:**
> Before calling `groupProducts()`, each product's `metaData.slug` must be parsed to
> extract dimensions into a `product.dims` object. Use the patterns from the ikas-api
> skill (e.g., `/maximum-(\d{2,4})x(\d{2,4})/` for DUBLE products,
> `/(\d{2,4})-cm--boy--(?:0-)?(\d{2,4})-cm/` for standard products).
> Set `product.dims = { maxWidth, maxHeight }` if a pattern matches, or `null` otherwise.
> `groupProducts()` internally calls `serializeDims()` on each product's `dims` to convert
> the `{ maxWidth, maxHeight }` object to a `"WxH"` string for grouping keys. Without this,
> dims objects would serialize as `"[object Object]"` in string interpolation.
> This step is omitted from the mock data below for brevity — the mock tests focus on
> color extraction and grouping logic only. In production code, parse dims first, then group.

```javascript
// Multi-word colors checked FIRST (prevents "Gri" matching inside "Metalik Gri")
const KNOWN_COLORS_MULTI = ["Metalik Gri", "Ara Gri"];

const KNOWN_COLORS_SINGLE = [
  "Beyaz", "Antrasit", "Altınmeşe", "Kahverengi", "Naturel",
  "Siyah", "Bronz", "Parlak", "Gri", "Krem",
  "Kırmızı", "Pudra", "Yeşil"
];

function trLower(s) {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı')
    .replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü').replace(/Ö/g, 'ö')
    .replace(/Ş/g, 'ş').replace(/Ç/g, 'ç').toLowerCase();
}

function extractColor(name) {
  const lower = trLower(name);

  // Phase 1: Multi-word colors first
  for (const color of KNOWN_COLORS_MULTI) {
    if (lower.includes(trLower(color))) return color;
  }

  // Phase 2: Single-word colors, rightmost match preferred
  const tokens = name.split(/\s+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tokenClean = tokens[i].replace(/[,;.]+$/, '');
    for (const color of KNOWN_COLORS_SINGLE) {
      if (trLower(tokenClean) === trLower(color)) return color;
    }
  }

  return null;
}

function extractBaseType(name) {
  let baseName = name.trim();
  // Remove multi-word colors first, then single-word
  for (const color of [...KNOWN_COLORS_MULTI, ...KNOWN_COLORS_SINGLE]) {
    baseName = baseName.replace(new RegExp(`\\s*${color}\\s*$`, 'i'), "").trim();
  }
  return baseName;
}

function serializeDims(dims) {
  if (!dims) return null;
  const w = dims.maxWidth ?? dims.width ?? dims.minWidth;
  const h = dims.maxHeight ?? dims.height ?? dims.minHeight;
  return (w && h) ? `${w}x${h}` : null;
}
```

### 1.3 Grouping Function

```javascript
function groupProducts(products) {
  products = products.map(p => ({ ...p, dims: serializeDims(p.dims) }));
  const groups = new Map();

  for (const product of products) {
    const color = extractColor(product.name);
    const baseType = extractBaseType(product.name);
    const dims = product.dims || null;
    const groupKey = dims ? `${baseType}|${dims}` : baseType;

    // Extract price from first active variant's prices array
    const activeVariants = (product.variants || []).filter(v => v.isActive !== false);
    const primaryVariant = activeVariants[0] || product.variants?.[0];
    let price = null;
    if (primaryVariant?.prices?.length) {
      const tryPrice = primaryVariant.prices.find(p => !p.currency || p.currency === 'TRY') || primaryVariant.prices[0];
      if (tryPrice) {
        const hasDiscount = tryPrice.discountPrice && tryPrice.discountPrice < tryPrice.sellPrice;
        price = Math.round((hasDiscount ? tryPrice.discountPrice : tryPrice.sellPrice) * 100) / 100;
      }
    }

    const slug = product.metaData?.slug;
    const url = slug ? `/${slug}` : null;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        type: baseType,
        ...(dims && { dims }),
        variants: []
      });
    }

    const group = groups.get(groupKey);
    const variant = { color: color || undefined, url };
    if (price != null) variant.price = price;
    group.variants.push(variant);
  }

  // Price hoisting: if ALL variants have same price, hoist to group level
  for (const group of groups.values()) {
    const prices = group.variants.filter(v => v.price != null).map(v => v.price);
    const allSamePrice = prices.length === group.variants.length
      && prices.length > 1
      && new Set(prices).size === 1;

    if (allSamePrice) {
      group.price = prices[0];
      for (const v of group.variants) {
        delete v.price;
      }
    }
    // Otherwise: each variant keeps its own price
  }

  return Array.from(groups.values());
}
```

### 1.4 Test Runner (Single-File Mode)

```javascript
console.log('=== Color Extraction ===');
const product1 = mockProducts[0];
console.log(`Name: ${product1.name}`);
console.log(`Color: ${extractColor(product1.name)}`);
console.log(`Base Type: ${extractBaseType(product1.name)}`);

console.log('\n=== Grouping ===');
const grouped = groupProducts(mockProducts);
console.log(`Products: ${mockProducts.length}`);
console.log(`Groups: ${grouped.length}`);
console.log(`Token Savings: ${Math.round(100 * (1 - grouped.length / mockProducts.length))}%`);

console.log('\n=== Sample Group ===');
console.log(JSON.stringify(grouped[0], null, 2));
```

### 1.5 Run Test

```bash
cd .agents/skills/ikas-products-grouping/references
node test-products.js
```

Expected output:
```
=== Color Extraction ===
Name: Akordeon DUBLE Kapı Sineklik Antrasit
Color: Antrasit
Base Type: Akordeon DUBLE Kapı Sineklik

=== Grouping ===
Products: 3
Groups: 1
Token Savings: 67%

=== Sample Group ===
{
  "type": "Akordeon DUBLE Kapı Sineklik",
  "variants": [
    { "color": "Antrasit", "price": 4621.5, "url": "/akordeon-duble-kapi-sineklik-antrasit-maximum-290x240" },
    { "color": "Beyaz", "price": 4621.5, "url": "/akordeon-duble-kapi-sineklik-beyaz-maximum-290x240" },
    { "color": "Altınmeşe", "price": 5220, "url": "/akordeon-duble-kapi-sineklik-altinmese-maximum-290x240" }
  ]
}
```

> **Note:** The mock data above contains only 3 products and the expected output is based
> strictly on that mock input (`Products: 3`, `Groups: 1`, `Token Savings: 67%`).
> If you later test with real storefront data, product/group counts will differ by category.
> Prices differ (4621.5, 4621.5, 5220 → Set.size = 2), so no price hoisting occurs —
> each variant retains its individual price. The `dims` field is absent because dimension
> parsing from slugs is a prerequisite step not shown in the mock (see section 1.2 note).

---

## Phase 2: Draft Tool Test in Sim Studio

Prefer the current draft-test surface from `../../sim-workflows/SKILL.md`: build or
update the workflow, then verify it with `sim_test` / `run_workflow`. The older
fine-grained flow (`upsert_custom_tools`, block toggles, `execute_workflow`,
`get_execution_logs`) is historical only and should not be treated as the default
workflow surface unless you are maintaining an older session that still exposes it.

### 2.1 Attach or Update the Tool via the Current Workflow Surface

```typescript
const toolConfig = {
  title: "Get Products by Main Category",
  schema: {
    type: "function",
    function: {
      name: "get_products_by_main_category",
      description: "Fetch grouped products by main category",
      parameters: {
        type: "object",
        properties: {
          mainCategory: {
            type: "string",
            enum: ["sineklikler", "perdeler", "otomatik-panjurlar", "profiller", "aksesuarlar", "tutamaklar"],
            description: "Product category"
          }
        },
        required: ["mainCategory"]
      }
    }
  },
  code: `
    // Tool code here - same transformation + grouping logic
    // Implement: fetch → flatten → group → format (see Phase 1 test patterns above)
  `
};

// Add or update the tool using the current local workflow-editing surface.
// Verify exact tool names against the live MCP definitions in your workspace
// before assuming older fine-grained commands are still exposed.
```

### 2.2 Keep the Draft Verification Path Minimal

1. Use a minimal draft path for verification: `start_trigger` → `agent` → `response`
2. Ensure the agent uses the new tool
3. Run a draft verification with `sim_test` or `run_workflow`
4. If the run fails, diagnose with `sim_debug`

### 2.3 Check Results

```typescript
sim_test({
  workflowId,
  request: "Run one draft test for mainCategory='sineklikler' and summarize the tool call, output shape, and any failures."
})

// Look for:
// ✓ Tool executed successfully
// ✓ Output matches expected schema
// ✓ No errors in transformations
```

### 2.4 Measure Token Usage

Record any token/cost metadata exposed by your current verification or runtime
surface. If your workspace only returns a path summary, treat precise token
measurement as a follow-up runtime check instead of falling back to legacy
execution-log commands by default.

---

## Phase 3: Full Integration Test

After draft testing passes:

1. Return to the normal end-to-end workflow path without relying on legacy
   block-toggle restore steps
2. Test realistic conversation flows
3. Verify agent routing (when to use tool vs other blocks)
4. Check token usage across multiple categories
5. Monitor performance in production

### 3.1 Conversation Test Cases

```
User: "Show me products in sineklikler"
Expected: Agent calls tool, returns grouped products, lists 3-5 variants

User: "What colors are available?"
Expected: Agent extracts colors from previous tool response

User: "I need a 290x240 sineklik"
Expected: Agent filters groups by dimension
```

### 3.2 Multi-Category Performance

Test with all categories to ensure consistent token savings.  
Use real measured values from your execution logs (replace placeholders below):

```
- sineklikler: <products> → <groups> (<savings>%)
- perdeler: <products> → <groups> (<savings>%)
- otomatik-panjurlar: <products> → <groups> (<savings>%)
- profiller: <products> → <groups> (<savings>%)
- aksesuarlar: <products> → <groups> (<savings>%)
- tutamaklar: <products> → <groups> (<savings>%)
```

---

## Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Color not extracted | Missing color in palette | Add to `colors` array |
| Null dimensions | Product missing dimensions | Add fallback: `dims ?? "standard"` |
| Variants not grouped | Group key mismatch | Check `baseType` extraction logic |
| High token usage | Nested objects not flattened | Remove unnecessary fields, use scalars |
| Tool times out | ikas API slow | Add Redis cache, implement pagination |
