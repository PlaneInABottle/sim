# Authentication

> **Note:** The two official Q&A documentation pages ([Fetching](https://developers.trendyol.com/docs/müşteri-sorularını-çekme) and [Answering](https://developers.trendyol.com/docs/müşteri-sorularını-cevaplama)) do not detail the authentication mechanism. The information below is from the general Trendyol Integration API documentation.

## Method

The Trendyol Integration API uses **HTTP Basic Auth**.

Credentials consist of an **API Key** and **API Secret**, which are combined as `apiKey:apiSecret`, Base64-encoded, and sent in the `Authorization` header:

```
Authorization: Basic {base64(apiKey:apiSecret)}
```

## Required Path Parameter

Both Q&A pages make clear that `supplierId` (seller/supplier ID) is required in the URL path for all endpoints.
