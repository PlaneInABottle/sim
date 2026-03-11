# Product Filtering — Data Models

All structures below are from the official documentation:
[Ürün Filtreleme - Onaylı Ürün v2](https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-filtreleme-onayl%C4%B1-%C3%BCr%C3%BCn-v2)

---

## Paginated Response Envelope

The approved products endpoint returns a paginated response:

```json
{
    "totalElements": 1,
    "totalPages": 1,
    "page": 0,
    "size": 20,
    "nextPageToken": "eyJzb3J0IjpbMTI3MTU4MTVdfQ==",
    "content": [ /* array of product content objects */ ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalElements` | int | Total number of matching products |
| `totalPages` | int | Total number of pages |
| `page` | int | Current page number |
| `size` | int | Page size |
| `nextPageToken` | string | Token for paginating beyond 10,000 items |
| `content` | array | Array of product content objects |

---

## Product Content Object

Each item in the `content` array represents a product content with its variants:

```json
{
    "contentId": 12715815,
    "productMainId": "12613876842A60",
    "brand": { "id": 315675, "name": "GUEYA" },
    "category": { "id": 91266, "name": "..." },
    "creationDate": 1760531038063,
    "lastModifiedDate": 1760938781669,
    "lastModifiedBy": "user@example.com",
    "title": "Açık Gri T-",
    "description": "değişti değişti2",
    "images": [ { "url": "..." } ],
    "attributes": [ /* content-level attributes */ ],
    "variants": [ /* array of variant objects */ ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `contentId` | int | Unique content identifier |
| `productMainId` | string | Supplier's product main ID |
| `brand` | object | Brand information (`id`, `name`) |
| `category` | object | Category information (`id`, `name`) |
| `creationDate` | long | Content creation timestamp (milliseconds) |
| `lastModifiedDate` | long | Last modification timestamp (milliseconds) |
| `lastModifiedBy` | string | Email of user who last modified |
| `title` | string | Product title |
| `description` | string | Product description |
| `images` | array | Array of image objects with `url` |
| `attributes` | array | Content-level attributes (see below) |
| `variants` | array | Array of variant objects (see below) |

---

## Content-Level Attribute Object

```json
{
    "attributeId": 47,
    "attributeName": "Renk",
    "attributeValues": [
        {
            "attributeValueId": null,
            "attributeValue": "Black"
        }
    ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `attributeId` | int | Attribute identifier |
| `attributeName` | string | Attribute name (e.g., "Renk" / Color) |
| `attributeValues` | array | Array of attribute value objects |
| `attributeValues[].attributeValueId` | int/null | Attribute value identifier (can be null) |
| `attributeValues[].attributeValue` | string | Attribute value text |

---

## Variant Object

Each variant represents a sellable unit of the product:

```json
{
    "variantId": 70228905,
    "supplierId": 2748,
    "barcode": "12613876842A60",
    "attributes": [
        {
            "attributeId": 293,
            "attributeName": "Beden",
            "attributeValueId": 4602,
            "attributeValue": "77 x 200 cm"
        }
    ],
    "productUrl": "https://stage.trendyol.com/abc/xyz-p-12715815?&merchantId=2748&filterOverPriceListings=false",
    "onSale": false,
    "deliveryOptions": { /* see DeliveryOptions below */ },
    "stock": { "lastModifiedDate": null },
    "price": { "salePrice": 222, "listPrice": 222 },
    "stockCode": "STK-stokum-1",
    "vatRate": 0,
    "sellerCreatedDate": 1760534152000,
    "sellerModifiedDate": 1761041127000,
    "locked": false,
    "lockReason": null,
    "lockDate": null,
    "archived": false,
    "archivedDate": null,
    "docNeeded": false,
    "hasViolation": false,
    "blacklisted": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `variantId` | int | Unique variant identifier |
| `supplierId` | int | Supplier/seller identifier |
| `barcode` | string | Variant barcode |
| `attributes` | array | Variant-level attributes (e.g., size) |
| `productUrl` | string | Product page URL on Trendyol |
| `onSale` | boolean | Whether variant is currently on sale |
| `deliveryOptions` | object | Delivery configuration (see below) |
| `stock` | object | Stock information |
| `stock.lastModifiedDate` | long/null | Last stock modification timestamp |
| `price` | object | Pricing information (see below) |
| `stockCode` | string | Seller's stock code |
| `vatRate` | int | VAT rate |
| `sellerCreatedDate` | long | When seller created this variant (timestamp) |
| `sellerModifiedDate` | long | When seller last modified (timestamp) |
| `locked` | boolean | Whether variant is locked |
| `lockReason` | string/null | Reason for lock |
| `lockDate` | long/null | When variant was locked |
| `archived` | boolean | Whether variant is archived |
| `archivedDate` | long/null | When variant was archived |
| `docNeeded` | boolean | Whether documentation is needed |
| `hasViolation` | boolean | Whether variant has violations |
| `blacklisted` | boolean | Whether variant is blacklisted |

---

## Variant-Level Attribute Object

Note: variant-level attributes have a flat structure (not nested `attributeValues` array):

```json
{
    "attributeId": 293,
    "attributeName": "Beden",
    "attributeValueId": 4602,
    "attributeValue": "77 x 200 cm"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `attributeId` | int | Attribute identifier |
| `attributeName` | string | Attribute name (e.g., "Beden" / Size) |
| `attributeValueId` | int | Attribute value identifier |
| `attributeValue` | string | Attribute value text |

---

## Price Object

```json
{
    "salePrice": 222,
    "listPrice": 222
}
```

| Field | Type | Description |
|-------|------|-------------|
| `salePrice` | number | Current sale price |
| `listPrice` | number | Original list price |

---

## DeliveryOptions Object

```json
{
    "deliveryDuration": 1,
    "isRushDelivery": true,
    "fastDeliveryOptions": [
        {
            "deliveryOptionType": "SAME_DAY_SHIPPING",
            "deliveryDailyCutOffHour": "15:00"
        }
    ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `deliveryDuration` | int | Delivery duration (days) |
| `isRushDelivery` | boolean | Whether rush delivery is available |
| `fastDeliveryOptions` | array | Fast delivery configuration |
| `fastDeliveryOptions[].deliveryOptionType` | string | Type of fast delivery (e.g., `SAME_DAY_SHIPPING`) |
| `fastDeliveryOptions[].deliveryDailyCutOffHour` | string | Daily cut-off time for fast delivery |
