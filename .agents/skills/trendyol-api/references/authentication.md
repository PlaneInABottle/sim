# Authentication

> **Note:** The two official Q&A documentation pages ([Fetching](https://developers.trendyol.com/docs/müşteri-sorularını-çekme) and [Answering](https://developers.trendyol.com/docs/müşteri-sorularını-cevaplama)) do not detail the authentication mechanism. The information below is from the general Trendyol Integration API documentation.

## Method

The Trendyol Integration API uses **HTTP Basic Auth**.

Credentials consist of an **API Key** and **API Secret**, which are combined as `apiKey:apiSecret`, Base64-encoded, and sent in the `Authorization` header:

```
Authorization: Basic {base64(apiKey:apiSecret)}
```

## Merchant Identifier Naming

Across the official docs in this skill, the merchant identifier appears as both `supplierId` and `sellerId` depending on the endpoint. Follow the parameter name used in each endpoint's own documentation instead of assuming one name applies everywhere.
