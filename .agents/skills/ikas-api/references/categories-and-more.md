# ikas Categories, Channels, Stock, Merchant, and Webhooks API Reference

## Table of Contents
- [Categories](#categories)
- [Sales Channels](#sales-channels)
- [Stock Locations](#stock-locations)
- [Merchant](#merchant)
- [Webhooks](#webhooks)
- [Product Attributes](#product-attributes)
- [Product Brands](#product-brands)
- [Product Tags](#product-tags)
- [Variant Types](#variant-types)

---

## Categories

### Schema
```graphql
type Category {
  id: ID!
  name: String!
  parentId: String                      # null for root categories
  categoryPath: [String!]               # IDs of all ancestor categories
  categoryPathItems: [CategoryPathItem!]
  description: String
  imageId: String
  isAutomated: Boolean
  orderType: CategoryProductsOrderTypeEnum
  salesChannelIds: [String!]
  salesChannels: [CategorySalesChannel!]
  shouldMatchAllConditions: Boolean
  conditions: [CategoryCondition!]
  metaData: HTMLMetaData                # { slug, title, description }
  translations: [CategoryTranslation!]
}
```

### Queries

```graphql
listCategory(
  id: StringFilterInput
  name: StringFilterInput
  categoryPath: CategoryPathFilterInput
  search: String                        # Searches "name" field
  updatedAt: DateFilterInput
): [Category!]!
```

**Note:** Returns array directly (no pagination wrapper). All categories are returned at once.

### Mutations
```graphql
saveCategory(input: CategoryInput!): Category!
deleteCategoryList(idList: [String!]!): Boolean!
```

**CategoryInput:** `{ id, name, parentId, description, imageId, salesChannelIds, orderType, conditions, metaData, translations }`

### Category Tree Pattern
Build hierarchical tree from flat list:
```js
function buildTree(categories) {
  const map = {};
  categories.forEach(c => map[c.id] = { ...c, children: [] });
  const roots = [];
  categories.forEach(c => {
    if (c.parentId && map[c.parentId]) map[c.parentId].children.push(map[c.id]);
    else roots.push(map[c.id]);
  });
  return roots;
}
```

### Visibility Filtering
A category is visible on the storefront if `salesChannelIds.length > 0`.

---

## Sales Channels

### Schema
```graphql
type SalesChannel {
  id: ID!
  name: String!
  type: SalesChannelTypeEnum!         # ADMIN, APP, B2B_STOREFRONT, FACEBOOK, GOOGLE, POS, STOREFRONT
  priceListId: String
  stockLocations: [SalesChannelStockLocation!]
  paymentGateways: [SalesChannelPaymentGateway!]
}
```

### Queries
```graphql
listSalesChannel(id: StringFilterInput): [SalesChannel!]!
getSalesChannel: SalesChannel           # Returns the app's own sales channel
```

### Mutations
```graphql
saveSalesChannel(input: SalesChannelInput!): SalesChannel
```

**SalesChannelInput:** `{ name, priceListId, stockLocations: [{ id, order }] }`

---

## Stock Locations

### Schema
```graphql
type StockLocation {
  id: ID!
  name: String!
  type: StockLocationTypeEnum          # PHYSICAL, VIRTUAL
  description: String
  deliveryTime: StockLocationDeliveryTimeEnum
  isRemindOutOfStockEnabled: Boolean
  outOfStockMailList: [String!]
  address: StockLocationAddress
}
```

### Queries
```graphql
# List stock location definitions
listStockLocation(
  id: StringFilterInput
  name: StringFilterInput
  updatedAt: DateFilterInput
): [StockLocation!]!

# List per-variant stock counts
listProductStockLocation(
  id: StringFilterInput
  productId: StringFilterInput
  variantId: StringFilterInput
  stockLocationId: StringFilterInput
  sort: String
  updatedAt: DateFilterInput
  pagination: PaginationInput
): ProductStockLocationPaginationResponse!
```

**ProductStockLocation response:** `{ count, data: [{ id, productId, variantId, stockLocationId, stockCount }], hasNext, limit, page }`

### Mutations
```graphql
saveProductStockLocations(input: SaveStockLocationsInput!): Boolean!
```

**Input:** `{ productStockLocationInputs: [{ productId, variantId, stockCount, stockLocationId }] }`

Creates new stock location entries or updates existing ones.

---

## Merchant

### Queries
```graphql
# Get merchant details
getMerchant: MerchantResponse
# { id, email, firstName, lastName, merchantName, storeName, phoneNumber, merchantSequence, address }

# Get authorized app info
getAuthorizedApp: AuthorizedApp
# { id, addedDate, partnerId, salesChannelId, scope, storeAppId, supportsMultipleInstallation }

# Get current app identity
me: MerchantResponse
# { id, email, name, scope, scopes, partnerId, storeAppId, salesChannelId }
```

No mutations — merchant info is read-only via API.

---

## Webhooks

### Schema
```graphql
type Webhook {
  id: ID!
  endpoint: String!
  scope: String!              # e.g., "store/customer/created"
}
```

### Available Scopes
- `store/customer/created`, `store/customer/updated`
- `store/order/created`, `store/order/updated`
- `store/product/created`, `store/product/updated`, `store/product/deleted`
- `store/category/created`, `store/category/updated`, `store/category/deleted`

### Queries
```graphql
listWebhook: [Webhook!]!
```

### Mutations
```graphql
# Register webhooks (multiple scopes at once)
saveWebhook(input: WebhookInput!): [Webhook!]!
# WebhookInput: { endpoint: String!, scopes: [String!]! }

# Delete webhooks by scope
deleteWebhook(scopeList: [String!]!): Boolean!
```

**Important:** If endpoint is unreachable or returns non-200, ikas retries 3 times then stops.

---

## Product Attributes

### Schema
```graphql
type ProductAttribute {
  id: ID!
  name: String!
  description: String
  type: ProductAttributeTypeEnum!
  options: [ProductAttributeOption!]
  tableTemplate: ProductAttributeTableTemplate
  translations: [ProductAttributeTranslation!]
}
```

### Queries & Mutations
```graphql
listProductAttribute(id: StringFilterInput, pagination: PaginationInput): ProductAttributePaginationResponse!
saveProductAttribute(input: ProductAttributeInput!): ProductAttribute!
deleteProductAttributeList(idList: [String!]!): Boolean!
productAttributeImport(input: [ProductAttributeInput!]!): Boolean!
```

---

## Product Brands

### Schema
```graphql
type ProductBrand {
  id: ID!
  name: String!
  description: String
  imageId: String
  metaData: HTMLMetaData
  orderType: CategoryProductsOrderTypeEnum
  salesChannelIds: [String!]
  translations: [ProductBrandTranslation!]
}
```

### Queries & Mutations
```graphql
listProductBrand(id: StringFilterInput): [ProductBrand!]!
saveProductBrand(input: ProductBrandInput!): ProductBrand!
deleteProductBrandList(idList: [String!]!): Boolean!
```

---

## Product Tags

### Schema
```graphql
type ProductTag {
  id: ID!
  name: String!
  translations: [ProductTagTranslation!]
}
```

### Queries & Mutations
```graphql
listProductTag(id: StringFilterInput): [ProductTag!]!
saveProductTag(input: ProductTagInput!): ProductTag!
deleteProductTagList(idList: [String!]!): Boolean!
```

---

## Variant Types

### Schema
```graphql
type VariantType {
  id: ID!
  name: String!                      # e.g., "Size", "Color"
  selectionType: VariantSelectionTypeEnum!  # CHOICE, COLOR
  values: [VariantValue!]!           # e.g., ["S", "M", "L"]
  translations: [VariantTypeTranslation!]
}
```

### Queries & Mutations
```graphql
listVariantType(id: StringFilterInput): [VariantType!]!
saveVariantType(input: VariantTypeInput!): VariantType!
deleteVariantTypeList(idList: [String!]!): Boolean!
```
