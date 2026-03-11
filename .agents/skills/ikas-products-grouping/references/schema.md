# API Schema

## Tool Parameters

```typescript
{
  type: "object",
  properties: {
    mainCategory: {
      type: "string",
      enum: ["sineklikler", "perdeler", "otomatik-panjurlar", "profiller", "aksesuarlar", "tutamaklar"],
      description: "Main product category slug from ikas storefront"
    }
  },
  required: ["mainCategory"]
}
```

## Response Schema (Grouped Format)

```json
{
  "mainCategory": "sineklikler",
  "categoryLabel": "Sineklikler",
  "totalProducts": 3,
  "totalGroups": 1,
  "groups": [
    {
      "type": "Akordeon DUBLE Kapı Sineklik",
      "dims": "290x240",
      "variants": [
        {
          "color": "Antrasit",
          "price": 4621.5,
          "url": "/akordeon-duble-kapi-sineklik-antrasit-maximum-290x240"
        },
        {
          "color": "Beyaz",
          "price": 4621.5,
          "url": "/akordeon-duble-kapi-sineklik-beyaz-maximum-290x240"
        },
        {
          "color": "Altınmeşe",
          "price": 5220,
          "url": "/akordeon-duble-kapi-sineklik-altinmese-maximum-290x240"
        }
      ]
    }
  ]
}
```

## Field Definitions

### Root Level

| Field | Type | Description |
|-------|------|-------------|
| `mainCategory` | string | Category slug (lowercase, hyphenated) |
| `categoryLabel` | string | Human-readable category name (Turkish) |
| `totalProducts` | number | Count of products in category (before grouping) |
| `totalGroups` | number | Count of groups (after grouping) |
| `groups` | array | Array of grouped products |

### Group Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Product type (base name without color) |
| `dims` | string | No | Dimensions: "widthxheight" (e.g., "290x240") |
| `price` | number | No | Base price in TRY. Omit if variants have different prices |
| `variants` | array | Yes | Color/price variants of this type |

### Variant Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `color` | string | No | Color name in Turkish (e.g., "Beyaz", "Antrasit") |
| `url` | string | Yes | Relative URL path (e.g., "/products/slug") |
| `price` | number | No | Price override. Only if different from group price |

## Color Palette (Kamatas Example)

```javascript
// Multi-word colors checked FIRST (longest match wins, prevents partial "gri" match)
const KNOWN_COLORS_MULTI = ["Metalik Gri", "Ara Gri"];

// Single-word colors, scanned across ALL word positions (rightmost match preferred)
const KNOWN_COLORS_SINGLE = [
  "Beyaz", "Antrasit", "Altınmeşe", "Kahverengi", "Naturel",
  "Siyah", "Bronz", "Parlak", "Gri", "Krem",
  "Kırmızı", "Pudra", "Yeşil"
];
```

**Notes on color extraction:**
- Two-phase matching: multi-word colors first, then single-word (prevents "Gri" matching inside "Metalik Gri")
- Turkish-aware lowercase comparison (`trLower()` handles İ→i, I→ı, etc.)
- Colors scanned across ALL word positions; rightmost match preferred (most likely variant suffix)
- Colors removed from product name during base type extraction
- If no color found: color field omitted from variant (not "Standart")

## ikas GraphQL Integration

### OAuth2 Token

```http
POST https://<store>.myikas.com/api/admin/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={{IKAS_CLIENT_ID}}&client_secret={{IKAS_CLIENT_SECRET}}
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 14400
}
```

**Notes:**
- Content-Type MUST be `application/x-www-form-urlencoded` (NOT JSON)
- Token expires in 14400 seconds (4 hours) — cache and refresh on 401
- In Sim Studio custom tools, use template variables: `{{IKAS_CLIENT_ID}}`, `{{IKAS_CLIENT_SECRET}}`

### Product Query

```graphql
query($categoryIds: CategoryFilterInput, $salesChannelIds: StringFilterInput, $pagination: PaginationInput) {
  listProduct(categoryIds: $categoryIds, salesChannelIds: $salesChannelIds, pagination: $pagination) {
    hasNext
    data {
      id
      name
      metaData { slug }
      baseUnit { type }
      attributes { value }
      variants {
        isActive
        prices { sellPrice discountPrice currency }
        images { imageId fileName isMain }
      }
    }
  }
}
```

**Variables:**
```json
{
  "categoryIds": { "in": ["7cbc724c-..."] },
  "salesChannelIds": { "eq": "c2a8f4e0-..." },
  "pagination": { "limit": 200, "page": 1 }
}
```

**Key differences from other GraphQL APIs:**
- Query name is `listProduct` (singular, NOT `listProducts`)
- Arguments are flat (NO `filter` wrapper, NO Relay `first`/`after` syntax)
- Response uses `{ data, hasNext }` (NOT `nodes`/`edges`)
- Pagination is page-based: `{ limit: N, page: N }` (1-indexed, max limit: 200)
- Variant prices use `prices[].sellPrice` (NOT `price.amount`)
- Variant images use `images[].imageId` (NOT `imagePath` or `images[].path`)

### Pagination for Large Categories

The ikas API returns a maximum of 200 products per page. For categories with more
than 200 products, you **must** paginate:

```javascript
// Pagination loop — fetch ALL products in a category
async function fetchAllProducts(categoryId, salesChannelId, token) {
  let allProducts = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const response = await graphqlQuery(token, {
      categoryIds: { in: [categoryId] },
      salesChannelIds: { eq: salesChannelId },
      pagination: { limit: 200, page }
    });

    allProducts = allProducts.concat(response.data);
    hasNext = response.hasNext;
    page++;
  }

  return allProducts;
}
```

**Limitations:**
- Max `limit` per request is **200** (ikas enforced)
- Very large categories (1000+ products) may require multiple round-trips
- Consider caching results (e.g., Redis with TTL) for production use

### Category Discovery

Get all categories (returns array directly, no pagination wrapper):

```graphql
{
  listCategory {
    id
    name
    parentId
    metaData { slug }
    salesChannelIds
  }
}
```

**Key differences:**
- Query name is `listCategory` (singular, NOT `listCategories`)
- NO filter wrapper — arguments are flat: `listCategory(id: ..., name: ..., search: ...)`
- Returns `[Category!]!` directly (NOT a pagination response)
- Filter root categories client-side: `categories.filter(c => !c.parentId)`
- Filter by sales channel client-side: `c.salesChannelIds?.includes(channelId)`

Result updates tool's enum:
```
mainCategory enum = [slug1, slug2, ...]  // from root categories' metaData.slug
```

## Token Efficiency Metrics

### Before Grouping (Flat Mock Input)

3 products × ~55 tokens/product = **~165 tokens**

Breakdown per product:
- Product name: 8 tokens
- Color: 2 tokens
- Dimensions: 4 tokens
- Price object: 6 tokens
- URL: 8 tokens
- Variant array overhead: 27 tokens

### After Grouping (Grouped Mock Output)

1 group × ~60 tokens/group = **~60 tokens**

Savings by optimization (mock example):
- Deduplication: 3 products → 1 group
- Relative URLs: removes domain overhead
- Omit nulls: no empty optional fields
- Flattened shape: lower token overhead for agents

**Result (mock): ~64% savings**

## Environment Variables

```
IKAS_CLIENT_ID=client_...
IKAS_CLIENT_SECRET=secret_...
SALES_CHANNEL_ID=c2a8f4e0-...
STORE_BASE_URL=https://kamatas.com
STORE_CATEGORIES_CACHE_TTL=86400  # 24 hours
```

## Error Handling

```javascript
// Invalid category
{
  "error": "Invalid mainCategory. Valid options: sineklikler, perdeler, otomatik-panjurlar, profiller, aksesuarlar, tutamaklar",
  "code": "INVALID_CATEGORY"
}

// ikas API error
{
  "error": "Failed to fetch from ikas API",
  "code": "IKAS_API_ERROR",
  "details": "GraphQL error: ..."
}

// Network timeout
{
  "error": "Request timed out",
  "code": "TIMEOUT"
}
```
