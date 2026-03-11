# Product Filtering API Reference — Approved Products v2

All information below is from the official Trendyol documentation:
- [Ürün Filtreleme - Onaylı Ürün v2](https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-filtreleme-onayl%C4%B1-%C3%BCr%C3%BCn-v2)

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| **PROD** | `https://apigw.trendyol.com/integration/product/sellers/{sellerId}/products/approved` |
| **STAGE** | `https://stageapigw.trendyol.com/integration/product/sellers/{sellerId}/products/approved` |

---

## GET filterProducts — List Approved Products

**Endpoint:** `GET /integration/product/sellers/{sellerId}/products/approved`

Lists approved products in your Trendyol store. Returns detailed product information including content-level data (brand, category, attributes, images) and variant-level data (pricing, stock, delivery options, status).

**Query Parameters:** See [Product Parameters](product-parameters.md) for the full table.

**Key Constraints (from official docs):**

- `page × size` maximum is **10,000**
- Page size (`size`) maximum is **100**
- For products beyond 10,000: use `nextPageToken` pagination
- `nextPageToken` is available when there are more than 10,000 approved content items

**Pagination with nextPageToken (from official docs):**

When you make a request with `?page=10&size=100`, the 100 items on page 10 are returned. For the next request, using `?size=100&nextPageToken=TOKEN` returns the next page (page 11) with 100 items. The `nextPageToken` can be used when there are more than 10,000 approved content items.

**Example Response (from official docs):**

```json
{
    "totalElements": 1,
    "totalPages": 1,
    "page": 0,
    "size": 20,
    "nextPageToken": "eyJzb3J0IjpbMTI3MTU4MTVdfQ==",
    "content": [
        {
            "contentId": 12715815,
            "productMainId": "12613876842A60",
            "brand": {
                "id": 315675,
                "name": "GUEYA"
            },
            "category": {
                "id": 91266,
                "name": "DOKUNMAYIN Attribute Attribute"
            },
            "creationDate": 1760531038063,
            "lastModifiedDate": 1760938781669,
            "lastModifiedBy": "user@example.com",
            "title": "Açık Gri T-",
            "description": "değişti değişti2",
            "images": [
                {
                    "url": "/mediacenter-stage3/stage/QC_PREP/20250731/11/f63d6503-ab94-3567-adbc-8f26a5cdaac6/1.jpg"
                }
            ],
            "attributes": [
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
            ],
            "variants": [
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
                    "deliveryOptions": {
                        "deliveryDuration": 1,
                        "isRushDelivery": true,
                        "fastDeliveryOptions": [
                            {
                                "deliveryOptionType": "SAME_DAY_SHIPPING",
                                "deliveryDailyCutOffHour": "15:00"
                            }
                        ]
                    },
                    "stock": {
                        "lastModifiedDate": null
                    },
                    "price": {
                        "salePrice": 222,
                        "listPrice": 222
                    },
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
            ]
        }
    ]
}
```
