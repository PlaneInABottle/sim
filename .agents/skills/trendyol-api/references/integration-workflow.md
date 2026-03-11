# Integration Workflow: Customer Questions + Product Filtering

This document describes how the **Customer Questions API** and the **Product Filtering API** connect to enable richer support workflows.

**Source APIs:**
- [Müşteri Sorularını Çekme](https://developers.trendyol.com/docs/müşteri-sorularını-çekme) (Customer Questions)
- [Ürün Filtreleme - Onaylı Ürün v2](https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-filtreleme-onayl%C4%B1-%C3%BCr%C3%BCn-v2) (Product Filtering)

---

## Use Case

When a customer asks a question about a product on Trendyol, the **Customer Questions API** returns the question along with a `productMainId`. This ID can be used as a query parameter in the **Product Filtering API** to fetch detailed product information — including pricing, variants, stock status, delivery options, and attributes.

This enables workflows where an agent can:
1. Retrieve unanswered customer questions
2. Look up the product the question is about
3. Use the product details to formulate an informed answer

---

## Connecting Fields

The key field linking the two APIs is `productMainId`:

| API | Field | Location | Description |
|-----|-------|----------|-------------|
| Customer Questions | `productMainId` | Response → `content[].productMainId` | The product's main ID in the question object |
| Product Filtering | `productMainId` | Query parameter | Filter products by this ID |

Additional shared context:

| Field | Customer Questions | Product Filtering |
|-------|-------------------|-------------------|
| Supplier ID | `supplierId` (path parameter) | `supplierId` (query parameter) + `sellerId` (path parameter) |
| Product name | `productName` (in question object) | `title` (in content object) |
| Product image | `imageUrl` (in question object) | `images[].url` (in content object) |

---

## Step-by-Step Flow

### Step 1: Fetch Unanswered Questions

```
GET /integration/qna/sellers/{supplierId}/questions/filter?status=WAITING_FOR_ANSWER&size=50
```

Response includes questions with `productMainId`:

```json
{
  "content": [
    {
      "id": 12345,
      "text": "Bu ürün su geçirmez mi?",
      "productMainId": "12613876842A60",
      "productName": "Açık Gri T-",
      "status": "WAITING_FOR_ANSWER"
    }
  ]
}
```

### Step 2: Fetch Product Details Using productMainId

Extract `productMainId` from the question and use it to query the product API:

```
GET /integration/product/sellers/{sellerId}/products/approved?productMainId=12613876842A60
```

Response includes full product details:

```json
{
  "content": [
    {
      "contentId": 12715815,
      "productMainId": "12613876842A60",
      "title": "Açık Gri T-",
      "description": "değişti değişti2",
      "brand": { "id": 315675, "name": "GUEYA" },
      "category": { "id": 91266, "name": "..." },
      "attributes": [
        { "attributeName": "Renk", "attributeValues": [{ "attributeValue": "Black" }] },
        { "attributeName": "Cinsiyet", "attributeValues": [{ "attributeValue": "Erkek" }] }
      ],
      "variants": [
        {
          "barcode": "12613876842A60",
          "onSale": false,
          "price": { "salePrice": 222, "listPrice": 222 },
          "deliveryOptions": { "deliveryDuration": 1, "isRushDelivery": true }
        }
      ]
    }
  ]
}
```

### Step 3: Use Combined Data

With both the question and product details available, you can:
- Reference specific product attributes in the answer
- Check pricing, stock status, and delivery options
- Verify the product's current state before responding

### Step 4: Submit Answer

```
POST /integration/qna/sellers/{sellerId}/questions/{questionId}/answers
Content-Type: application/json

{
  "text": "Evet, bu ürün su geçirmez özelliktedir."
}
```

---

## Combined Output Example

A workflow combining both APIs produces a unified view:

```json
{
  "question": {
    "id": 12345,
    "text": "Bu ürün su geçirmez mi?",
    "status": "WAITING_FOR_ANSWER",
    "userName": "Ahmet Y.",
    "creationDate": 1760531038063
  },
  "product": {
    "productMainId": "12613876842A60",
    "title": "Açık Gri T-",
    "brand": "GUEYA",
    "category": "...",
    "salePrice": 222,
    "listPrice": 222,
    "onSale": false,
    "color": "Black",
    "deliveryDuration": 1,
    "isRushDelivery": true
  }
}
```

---

## API Base URLs

| API | PROD | STAGE |
|-----|------|-------|
| Customer Questions | `https://apigw.trendyol.com/integration/qna/sellers/{supplierId}` | `https://stageapigw.trendyol.com/integration/qna/sellers/{supplierId}` |
| Product Filtering (Approved v2) | `https://apigw.trendyol.com/integration/product/sellers/{sellerId}/products/approved` | `https://stageapigw.trendyol.com/integration/product/sellers/{sellerId}/products/approved` |

Both APIs use the same **HTTP Basic Auth** authentication. See [Authentication](authentication.md).
