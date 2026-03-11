# Data Models

All structures and field descriptions below are from the official documentation:
[Müşteri Sorularını Çekme](https://developers.trendyol.com/docs/müşteri-sorularını-çekme)

---

## Paginated Response Envelope

The filter endpoint returns a paginated response:

```json
{
  "content": [ /* array of question objects */ ],
  "page": 10,
  "size": 2,
  "totalElements": 864,
  "totalPages": 432
}
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | array | Array of question objects |
| `page` | int | Current page number |
| `size` | int | Page size |
| `totalElements` | int | Total matching questions |
| `totalPages` | int | Total number of pages |

---

## Question Object

Each item in the `content` array:

```json
{
  "answer": {
    "creationDate": 0,
    "hasPrivateInfo": true,
    "id": 0,
    "reason": "string",
    "text": "string"
  },
  "answeredDateMessage": "string",
  "creationDate": 0,
  "customerId": 0,
  "id": 0,
  "imageUrl": "string",
  "productName": "string",
  "public": true,
  "reason": "string",
  "rejectedAnswer": {
    "creationDate": 0,
    "id": 0,
    "reason": "string",
    "text": "string"
  },
  "rejectedDate": 0,
  "reportReason": "string",
  "reportedDate": 0,
  "showUserName": true,
  "status": "string",
  "text": "string",
  "userName": "string",
  "webUrl": "string",
  "productMainId": "1234567"
}
```

---

## Field Descriptions (from official docs)

| Field | Description (translated from Turkish) |
|-------|---------------------------------------|
| `customerId` | Customer's registered ID on trendyol.com |
| `answeredDateMessage` | Question answering duration/time message |
| `creationDate` | Date when the customer asked the question on trendyol.com |
| `imageUrl` | Image link of the product the question is about |
| `productName` | Name of the product the question is about |
| `public` | Whether the question is shown on trendyol.com |
| `reason` | Returned value if the question is rejected |
| `rejectedAnswer` | Details of the last rejected answer for the question |
| `rejectedDate` | Date when the question was rejected |
| `reportReason` | Description written when the seller reports the question. This action can only be done from the Trendyol Seller Panel |
| `reportedDate` | Date when the seller reported the question |
| `showUserName` | Whether the customer's name is shown on trendyol.com |
| `status` | The question's status |
| `text` | The question text asked by the customer |
| `userName` | The customer's name |

**Additional fields from the JSON example (with inline comments in official docs):**

| Field | Comment from docs |
|-------|-------------------|
| `id` | The question's ID (Sorunun id'si) |
| `answer.creationDate` | Date when the answer was given (Cevabın verildiği tarih) |
| `rejectedAnswer.creationDate` | Creation date of the last rejected answer (En son red edilen cevabın oluşturulma tarihi) |

**Fields present in the JSON but without explicit description in docs:**
- `answer.hasPrivateInfo` (boolean)
- `answer.id` (int)
- `answer.reason` (string)
- `answer.text` (string)
- `rejectedAnswer.id` (int)
- `rejectedAnswer.reason` (string)
- `rejectedAnswer.text` (string)
- `webUrl` (string)
- `productMainId` (string — example value "1234567")

---

## Answer Request Body

For the POST createAnswer endpoint:

```json
{
  "text": "string"
}
```

Constraints: minimum 10 characters, maximum 2000 characters.
