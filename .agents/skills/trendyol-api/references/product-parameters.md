# Product Filtering — Query Parameters

All parameters below are from the official documentation:
[Ürün Filtreleme - Onaylı Ürün v2](https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-filtreleme-onayl%C4%B1-%C3%BCr%C3%BCn-v2)

These parameters apply to the **GET filterProducts** endpoint:
`GET /integration/product/sellers/{sellerId}/products/approved`

---

## Query Parameters (Giriş Parametreleri)

| Parameter | Description (translated from Turkish) | Type |
|-----------|---------------------------------------|------|
| `barcode` | Must be sent to query a specific barcode | string |
| `startDate` | Fetches products after the specified date. Must be sent as Timestamp | long |
| `endDate` | Fetches products before the specified date. Must be sent as Timestamp | long |
| `page` | Returns only the specified page | int |
| `dateQueryType` | The date field the date filter operates on. Can be sent as `VARIANT_CREATED_DATE`, `VARIANT_MODIFIED_DATE`, or `CONTENT_MODIFIED_DATE` | string |
| `size` | Specifies the maximum number to list per page. Maximum value is **100** | int |
| `supplierId` | The supplier's ID must be sent | long |
| `stockCode` | The supplier's stock code must be sent | string |
| `productMainId` | The supplier's productMainId must be sent | string |
| `brandIds` | Used to list products with the specified brandId | array |
| `status` | Status field can take values: `archived`, `blacklisted`, `locked`, `onSale` | string |
| `nextPageToken` | Used to retrieve content beyond 10,000 items | string |

---

## Path Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| `sellerId` | The seller/supplier ID — part of the URL path | **Yes** |

---

## Pagination Constraints

From the official docs:
- `page × size` maximum is **10,000**
- `size` maximum is **100**
- For content beyond 10,000 items: use `nextPageToken`
- When `nextPageToken` is used, `page` is not needed — just `size` and `nextPageToken`

---

## Date Query Types

| `dateQueryType` Value | Meaning |
|----------------------|---------|
| `VARIANT_CREATED_DATE` | Filter by variant creation date |
| `VARIANT_MODIFIED_DATE` | Filter by variant modification date |
| `CONTENT_MODIFIED_DATE` | Filter by content modification date |

---

## Status Values

| `status` Value | Meaning |
|---------------|---------|
| `archived` | Product is archived |
| `blacklisted` | Product is blacklisted |
| `locked` | Product is locked |
| `onSale` | Product is on sale |
