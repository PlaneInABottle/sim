---
name: trendyol-api
description: Reference for Trendyol Marketplace APIs — Customer Questions (Q&A) and Product Filtering (Approved Products v2). Use when the AI agent needs official request/response details, constraints, pagination, status values, or the combined product-aware Q&A flow for Trendyol seller support workflows. Based exclusively on official Trendyol developer documentation.
---

# Trendyol Marketplace API

Reference for Trendyol's **Customer Questions API** and **Product Filtering API** (Approved Products v2). These two APIs work together to enable rich product-aware support workflows.

**Source documentation:**
- [Müşteri Sorularını Çekme](https://developers.trendyol.com/docs/müşteri-sorularını-çekme) (Customer Questions — Fetching)
- [Müşteri Sorularını Cevaplama](https://developers.trendyol.com/docs/müşteri-sorularını-cevaplama) (Customer Questions — Answering)
- [Ürün Filtreleme - Onaylı Ürün v2](https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-filtreleme-onayl%C4%B1-%C3%BCr%C3%BCn-v2) (Product Filtering — Approved Products)

---

## API Endpoints

### Customer Questions

| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `.../qna/sellers/{supplierId}/questions/filter` | List/filter questions with pagination |
| **GET** | `.../qna/sellers/{supplierId}/questions/{id}` | Get single question by ID |
| **POST** | `.../qna/sellers/{sellerId}/questions/{id}/answers` | Submit an answer to a question |

### Product Filtering — Approved Products v2

| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `.../product/sellers/{sellerId}/products/approved` | List approved products with full details |

---

## Key Constraints (from official docs)

### Customer Questions
- No date parameters → returns last **1 week** of questions
- With `startDate`/`endDate` → maximum range is **2 weeks**
- Page size maximum: **50**
- Answer text: minimum **10** characters, maximum **2000** characters
- `supplierId` is **required** in the filter request
- Timestamps use **milliseconds** (not seconds)

### Product Filtering
- `page × size` maximum is **10,000**
- Page size (`size`) maximum is **100**
- For products beyond 10,000: use `nextPageToken` pagination
- `sellerId` is **required** in the URL path

---

## Integrated Workflow

The Customer Questions API returns a `productMainId` with each question. This same ID can be used as a query parameter in the Product Filtering API to fetch detailed product information — pricing, variants, delivery options, and attributes.

**Flow:** Question → extract `productMainId` → fetch product details → formulate informed answer

See [Integration Workflow](references/integration-workflow.md) for the full step-by-step guide with examples.

---

## Status Values (Customer Questions)

| Status | Description |
|--------|-------------|
| `WAITING_FOR_ANSWER` | Awaiting seller response |
| `WAITING_FOR_APPROVE` | Submitted, pending approval |
| `ANSWERED` | Approved and published |
| `REJECTED` | Answer rejected |
| `REPORTED` | Reported (via Trendyol Seller Panel only) |

## Status Values (Product Filtering)

| Status | Description |
|--------|-------------|
| `onSale` | Product is on sale |
| `archived` | Product is archived |
| `blacklisted` | Product is blacklisted |
| `locked` | Product is locked |

---

## References

### Customer Questions API

| File | Contents |
|------|----------|
| [API Reference](references/api-reference.md) | All 3 endpoints with URLs, methods, and response examples |
| [Parameters](references/parameters.md) | Query parameters for the filter endpoint |
| [Data Models](references/data-models.md) | Response JSON structures and field descriptions |

### Product Filtering API (Approved Products v2)

| File | Contents |
|------|----------|
| [Product API Reference](references/product-api-reference.md) | Endpoint with URLs, method, and response example |
| [Product Parameters](references/product-parameters.md) | All query parameters and constraints |
| [Product Data Models](references/product-data-models.md) | Response schema — Content, Variants, Pricing, DeliveryOptions |

### Shared

| File | Contents |
|------|----------|
| [Authentication](references/authentication.md) | Basic Auth (shared by both APIs) |
| [Integration Workflow](references/integration-workflow.md) | How to combine both APIs for product-aware Q&A support |

---
