# ikas Customers API Reference

## Table of Contents
- [Customer Type Schema](#customer-type-schema)
- [Customer Address Schema](#customer-address-schema)
- [Queries](#queries)
- [Phone Lookup Pattern](#phone-lookup-pattern)
- [Examples](#examples)

## Customer Type Schema

```graphql
type Customer {
  id: ID!
  firstName: String!
  lastName: String
  fullName: String
  email: String
  phone: String
  note: String
  ip: String
  userAgent: String
  preferredLanguage: String

  # Verification
  isEmailVerified: Boolean
  isPhoneVerified: Boolean
  emailVerifiedDate: Timestamp
  phoneVerifiedDate: Timestamp

  # Account
  accountStatus: CustomerAccountStatusEnum    # ACTIVE_ACCOUNT, DECLINED_ACCOUNT_INVITATION, DISABLED_ACCOUNT, INVITED_TO_CREATE_ACCOUNT
  accountStatusUpdatedAt: Timestamp
  passwordUpdateDate: Timestamp
  registrationSource: CustomerRegistrationSourceEnum

  # Orders
  orderCount: Float
  totalOrderPrice: Float
  firstOrderDate: Timestamp
  lastOrderDate: Timestamp
  customerOrderCount: Float

  # Grouping
  customerGroupIds: [String!]
  customerSegmentIds: [String!]
  tagIds: [String!]
  customerSequence: Float

  # Pricing
  priceListId: String
  lastPriceListId: String
  lastStorefrontRoutingId: String
  priceListRules: [CustomerPriceListRule!]

  # Subscriptions
  subscriptionStatus: CustomerEmailSubscriptionStatusesEnum  # NOT_SUBSCRIBED, SUBSCRIBED, PENDING_CONFIRMATION
  subscriptionStatusUpdatedAt: Timestamp

  # Address
  addresses: [CustomerAddress!]              # Up to 10 most recent
  attributes: [CustomerAttributeValue!]

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Customer Address Schema

```graphql
type CustomerAddress {
  id: ID!
  firstName: String!
  lastName: String!
  phone: String
  addressLine1: String!
  addressLine2: String
  postalCode: String
  company: String
  identityNumber: String
  taxNumber: String
  taxOffice: String
  title: String!
  isDefault: Boolean
  city: { id: String, code: String, name: String! }
  district: { id: String, code: String, name: String }
  country: { id: String, code: String, iso2: String, iso3: String, name: String! }
  state: { id: String, code: String, name: String }
  region: { id: String, code: String, name: String }
  attributes: [CustomerAttributeValue!]
}
```

## Queries

### listCustomer

```graphql
listCustomer(
  id: StringFilterInput
  email: StringFilterInput          # { eq: "user@example.com" }
  phone: StringFilterInput          # { eq: "5123456789999" } — note: raw digits
  merchantId: StringFilterInput
  search: String                    # Free-text across name, email, phone
  sort: String                     # Sortable: "updatedAt"
  updatedAt: DateFilterInput
  pagination: PaginationInput
): CustomerPaginationResponse!
```

**Response:** `{ count, data: [Customer], hasNext, limit, page }`

**Important notes:**
- `phone` filter uses `StringFilterInput` with raw digits: `{ eq: "5123456789999" }`
- `search` is more flexible — searches across name, email, phone with partial matching
- For phone lookups, `search` with the phone string is more reliable than the `phone` filter

## Phone Lookup Pattern

ikas has no direct phone filter on orders. The proven pattern:

```js
// Step 1: Normalize phone — strip non-digits, handle Turkish prefixes
function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, '');
  // Handle +90, 090, 0090 prefixes
  if (digits.startsWith('0090')) digits = digits.slice(4);
  else if (digits.startsWith('090')) digits = digits.slice(3);
  else if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits;
}

// Step 2: Search customers
const result = await graphql(token, `
  query($search: String, $pagination: PaginationInput) {
    listCustomer(search: $search, pagination: $pagination) {
      count
      data { id firstName lastName phone email }
    }
  }
`, { search: phoneNumber, pagination: { limit: 20, page: 1 } });

// Step 3: Match by normalized phone (search returns fuzzy results)
const normalizedInput = normalizePhone(phoneNumber);
const customer = result.data.listCustomer.data.find(c =>
  c.phone && normalizePhone(c.phone).endsWith(normalizedInput)
);

// Step 4: Get customer's orders
const orders = await graphql(token, `
  query($customerId: StringFilterInput, $pagination: PaginationInput, $sort: String) {
    listOrder(customerId: $customerId, pagination: $pagination, sort: $sort) {
      count data { orderNumber status orderedAt totalFinalPrice }
    }
  }
`, { customerId: { eq: customer.id }, pagination: { limit: 10, page: 1 }, sort: "-orderedAt" });
```

## Examples

### List all customers
```graphql
{
  listCustomer(pagination: { limit: 50, page: 1 }) {
    count
    data {
      id firstName lastName email phone
      accountStatus isEmailVerified isPhoneVerified
      orderCount totalOrderPrice
      createdAt updatedAt
    }
  }
}
```

### Search by email
```graphql
query($email: StringFilterInput, $pagination: PaginationInput) {
  listCustomer(email: $email, pagination: $pagination) {
    count
    data {
      id firstName lastName email phone
      addresses {
        id firstName lastName phone
        addressLine1 addressLine2 postalCode isDefault
        city { id name } district { id name } country { id name }
      }
    }
  }
}
# Variables: { "email": { "eq": "customer@example.com" }, "pagination": { "limit": 1, "page": 1 } }
```

### Full customer with addresses
```graphql
query($search: String, $pagination: PaginationInput) {
  listCustomer(search: $search, pagination: $pagination) {
    count
    data {
      id email firstName lastName phone
      createdAt updatedAt customerSegmentIds
      isEmailVerified isPhoneVerified birthDate gender note
      orderCount totalOrderPrice firstOrderDate lastOrderDate
      accountStatus subscriptionStatus
      addresses {
        id firstName lastName phone
        addressLine1 addressLine2 postalCode isDefault
        city { id name } district { id name } country { id name }
      }
    }
  }
}
```

### Recently updated customers
```graphql
query($updatedAt: DateFilterInput, $pagination: PaginationInput) {
  listCustomer(updatedAt: $updatedAt, pagination: $pagination, sort: "-updatedAt") {
    count
    data { id firstName lastName email phone updatedAt orderCount }
  }
}
# Variables: { "updatedAt": { "gte": <unix_ms_24h_ago> }, "pagination": { "limit": 100, "page": 1 } }
```
