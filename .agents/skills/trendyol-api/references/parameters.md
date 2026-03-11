# Query Parameters

All parameters below are from the official documentation:
[Müşteri Sorularını Çekme](https://developers.trendyol.com/docs/müşteri-sorularını-çekme)

These parameters apply to the **GET questionsFilter** endpoint:
`GET /integration/qna/sellers/{supplierId}/questions/filter`

---

## Service Parameters (Servis Parametreleri)

> **`supplierId`** must be sent as a required field in the request.

| Parameter | Parameter Value | Description | Type |
|-----------|----------------|-------------|------|
| `barcode` | | For questions related to a specific barcode value | long |
| `page` | | Returns only the specified page | int |
| `size` | Maximum 50 | Maximum number to list per page | int |
| `supplierId` | | Supplier ID must be sent (required) | long |
| `endDate` | | Fetches questions up to the specified date. Must be sent as Timestamp (millisecond) | long |
| `startDate` | | Fetches questions after the specified date. Must be sent as Timestamp (millisecond) | long |
| `status` | `WAITING_FOR_ANSWER`, `WAITING_FOR_APPROVE`, `ANSWERED`, `REPORTED`, `REJECTED` | Fetches questions by their status | string |
| `orderByField` | `LastModifiedDate` | Sorts by last modified date | string |
| `orderByField` | `CreatedDate` | Sorts by question creation date | string |
| `orderByDirection` | `ASC` | Sorts from old to new | string |
| `orderByDirection` | `DESC` | Sorts from new to old | string |

---

## Date Range Constraints

From the official docs:
- **No date parameters:** Returns questions from the last **1 week**
- **With `startDate` and `endDate`:** Maximum range is **2 weeks**
- Date values must be **timestamps in milliseconds** (e.g., 13-digit Unix timestamp)

---

## Status Values

| Status | Description (from docs) |
|--------|------------------------|
| `WAITING_FOR_ANSWER` | Question awaiting seller answer |
| `WAITING_FOR_APPROVE` | Answer submitted, pending approval |
| `ANSWERED` | Answer approved and published |
| `REPORTED` | Question reported (via Seller Panel only — see field descriptions) |
| `REJECTED` | Answer rejected |

---

## Sorting Options

| `orderByField` Value | Meaning |
|---------------------|---------|
| `LastModifiedDate` | Sort by last modification date |
| `CreatedDate` | Sort by question creation date |

| `orderByDirection` Value | Meaning |
|-------------------------|---------|
| `ASC` | Old to new (eskiden yeniye) |
| `DESC` | New to old (yeniden eskiye) |
