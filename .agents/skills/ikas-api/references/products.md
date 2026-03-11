# ikas Products API Reference

## Table of Contents
- [Product Type Schema](#product-type-schema)
- [Variant Type Schema](#variant-type-schema)
- [Queries](#queries)
- [Mutations](#mutations)
- [Image Upload (REST)](#image-upload-rest)
- [Examples](#examples)

## Product Type Schema

```graphql
type Product {
  id: ID!
  name: String!
  description: String
  shortDescription: String
  type: ProductTypeEnum!          # BUNDLE, DIGITAL, MEMBERSHIP, PHYSICAL
  totalStock: Float
  weight: Float
  maxQuantityPerCart: Float
  brandId: String
  brand: SimpleProductBrand       # { id, name }
  vendorId: String
  categoryIds: [String!]
  categories: [SimpleCategory!]   # [{ id, name }]
  tagIds: [String!]
  tags: [SimpleProductTag!]       # [{ id, name }]
  salesChannelIds: [String!]
  hiddenSalesChannelIds: [String!]
  dynamicPriceListIds: [String!]
  googleTaxonomyId: String
  groupVariantsByVariantTypeId: String
  productOptionSetId: String
  productVolumeDiscountId: String
  metaData: HTMLMetaData          # { slug, title, description }
  productVariantTypes: [ProductVariantType!]
  variants: [Variant!]!
  attributes: [ProductAttributeValue!]
  baseUnit: ProductBaseUnitModel
  translations: [ProductTranslation!]
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Variant Type Schema

```graphql
type Variant {
  id: ID!
  sku: String
  barcodeList: [String!]
  isActive: Boolean
  weight: Float
  sellIfOutOfStock: Boolean
  prices: [VariantPrice!]
  stocks: [VariantStock!]
  images: [VariantImage!]
  variantValues: [VariantValue!]
}

type VariantPrice {
  sellPrice: Float!
  buyPrice: Float
  discountPrice: Float
  currency: String
  currencySymbol: String
  priceListId: String
  unitPrice: Float
}

type VariantStock {
  stockCount: Float
  stockLocationId: String
}

type VariantImage {
  imageId: String
  fileName: String
  isMain: Boolean
  isVideo: Boolean
  order: Int
}

type ProductVariantType {
  id: ID!
  name: String!                # e.g., "Size", "Color"
  selectionType: VariantSelectionTypeEnum!
  values: [VariantValue!]!     # e.g., ["S", "M", "L", "XL"]
  translations: [VariantTypeTranslation!]
}
```

## Queries

### listProduct

```graphql
listProduct(
  id: StringFilterInput
  name: StringFilterInput
  categoryIds: CategoryFilterInput       # { in: ["cat-id"] }
  brandId: StringFilterInput
  vendorId: StringFilterInput
  tagIds: StringFilterInput
  salesChannelIds: StringFilterInput
  sku: StringFilterInput
  barcodeList: StringFilterInput
  attributeId: ProductAttributeFilterInput
  variantTypeId: StringFilterInput
  variantStockLocationId: StringFilterInput
  includeDeleted: Boolean
  sort: String                           # "createdAt", "updatedAt", "name" (prefix - for desc)
  pagination: PaginationInput
): ProductPaginationResponse!
```

**Response:** `{ count, data: [Product], hasNext, limit, page }`

### searchProducts

```graphql
searchProducts(input: SearchInput!): ProductSearchResponse!
```

Full-text search across product fields.

## Mutations

### saveProduct
Create or update a product. If `id` is provided in input, updates; otherwise creates.

```graphql
mutation {
  saveProduct(input: ProductInput!) : Product!
}
```

**ProductInput fields:** `id`, `name`, `description`, `shortDescription`, `type`, `brandId`, `vendorId`, `categoryIds`, `tagIds`, `salesChannelIds`, `hiddenSalesChannelIds`, `maxQuantityPerCart`, `googleTaxonomyId`, `groupVariantsByVariantTypeId`, `metaData` (HTMLMetaDataInput), `productVariantTypes` (VariantTypeInput[]), `variants` (VariantInput[]), `translations`, `attributes`, `baseUnit`, `weight`.

### deleteProductList

```graphql
mutation {
  deleteProductList(idList: [String!]!): Boolean!
}
```

### bulkUpdateProducts

```graphql
mutation {
  bulkUpdateProducts(input: [BulkUpdateProductsInput!]!): String!
}
```

Batch update products — supports updating brands, categories, tags, images, prices, stocks, variant types, sales channel status, and HTML metadata in bulk.

### saveVariantPrices

```graphql
mutation {
  saveVariantPrices(input: SaveVariantPricesInput!): Boolean!
}
```

**SaveVariantPricesInput:** `{ priceListId: String!, variantPriceInputs: [{ productId, variantId, price: { buyPrice, sellPrice, discountPrice } }] }`

### updateProductSalesChannelStatus

```graphql
mutation {
  updateProductSalesChannelStatus(
    input: [UpdateProductSalesChannelStatusInput!]!
    salesChannelId: String
  ): Boolean!
}
```

## Image Upload (REST)

**POST** `https://api.myikas.com/api/v1/admin/product/upload/image`

Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`

Supports uploading images for products (variants), categories, and brands. Only ONE of the three input types per request.

### Product Image Input
```json
{
  "productImage": {
    "variantIds": ["variant-id-1", "variant-id-2"],
    "order": 1,
    "isMain": true,
    "url": "https://example.com/image.jpg"
  }
}
```
Either `url` or `base64` string is accepted (not both).

### Category / Brand Image Input
```json
{
  "categoryImage": { "categoryIds": ["cat-id"], "url": "..." }
}
```

Response: HTTP 200 `OK` on success.

## Examples

### List products with prices
```graphql
{
  listProduct(pagination: { limit: 30, page: 1 }) {
    count
    data {
      id name totalStock
      metaData { slug }
      variants {
        id sku isActive
        prices { sellPrice discountPrice currency }
        stocks { stockCount stockLocationId }
      }
    }
  }
}
```

### Get single product by ID
```graphql
query($id: StringFilterInput) {
  listProduct(id: $id, pagination: { limit: 1, page: 1 }) {
    data {
      id name description shortDescription totalStock
      categories { id name }
      brand { id name }
      tags { id name }
      metaData { slug }
      productVariantTypes {
        order
        variantType { id name }
        variantValueIds
      }
      variants {
        id sku barcodeList isActive weight sellIfOutOfStock
        prices { sellPrice buyPrice discountPrice currency }
        stocks { stockCount stockLocationId }
        images { imageId fileName isMain isVideo order }
      }
      createdAt updatedAt
    }
  }
}
# Variables: { "id": { "eq": "product-uuid" } }
```

### Products by category
```graphql
query($categoryIds: CategoryFilterInput, $pagination: PaginationInput) {
  listProduct(categoryIds: $categoryIds, pagination: $pagination) {
    data {
      id name totalStock salesChannelIds
      metaData { slug }
      variants { id isActive prices { sellPrice discountPrice currency } }
    }
  }
}
# Variables: { "categoryIds": { "in": ["cat-uuid"] }, "pagination": { "limit": 30, "page": 1 } }
```

### Update variant prices
```graphql
mutation {
  saveVariantPrices(input: {
    priceListId: "pricelist-uuid"
    variantPriceInputs: [{
      productId: "product-uuid"
      variantId: "variant-uuid"
      price: { buyPrice: 15, sellPrice: 30 }
    }]
  })
}
```
