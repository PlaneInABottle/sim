# API Reference

All information below is from the official Trendyol documentation:
- [Müşteri Sorularını Çekme](https://developers.trendyol.com/docs/müşteri-sorularını-çekme)
- [Müşteri Sorularını Cevaplama](https://developers.trendyol.com/docs/müşteri-sorularını-cevaplama)

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| **PROD** | `https://apigw.trendyol.com/integration/qna/sellers/{supplierId}` |
| **STAGE** | `https://stageapigw.trendyol.com/integration/qna/sellers/{supplierId}` |

---

## 1. GET questionsFilter — List/Filter Questions

**Endpoint:** `GET /integration/qna/sellers/{supplierId}/questions/filter`

Fetches all customer questions asked to the supplier. Without date parameters, returns questions from the **last 1 week**. With `startDate` and `endDate`, the maximum range is **2 weeks**.

The docs also mention a "Recommended Endpoint" (Önerilen Endpoint) variant for PROD.

**Query Parameters:** See [Parameters](parameters.md) for the full table.

**Example Response (from official docs):**

```json
{
  "content": [
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
  ],
  "page": 10,
  "size": 2,
  "totalElements": 864,
  "totalPages": 432
}
```

**Response comments from official docs:**
- `answer.creationDate`: Date when the answer was given (Cevabın verildiği tarih)
- `rejectedAnswer.creationDate`: Creation date of the last rejected answer (En son red edilen cevabın oluşturulma tarihi)
- `id`: The question's ID (Sorunun id'si)

---

## 2. GET question by ID — Single Question Detail

**Endpoint:** `GET /integration/qna/sellers/{supplierId}/questions/{id}`

Fetches a single question by its `id` value returned from the filter endpoint.

From the docs: "You can fetch questions individually and process them using the question `id` value returned from the above service."

The response is the same question object structure as shown in the `content` array above.

---

## 3. POST createAnswer — Answer a Question

**Endpoint:** `POST /integration/qna/sellers/{sellerId}/questions/{id}/answers`

Submits an answer to a customer question fetched via the fetching service.

**Constraint:** Answer text must be minimum **10** characters, maximum **2000** characters.

**Request Body (from official docs):**

```json
{
  "text": "string"
}
```

**Response (from official docs):**

```
"HTTP 200"
```
