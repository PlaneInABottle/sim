# ikas Orders API Reference

## Table of Contents
- [Order Type Schema](#order-type-schema)
- [Order Sub-Types](#order-sub-types)
- [Enum Values](#enum-values)
- [Queries](#queries)
- [Mutations](#mutations)
- [Examples](#examples)

## Order Type Schema

```graphql
type Order {
  id: ID!
  orderNumber: String              # Starts from 1001, sequential
  orderSequence: Float             # Sequence value (orderNumber - 1000)
  status: OrderStatusEnum!         # CANCELLED, CREATED, DRAFT, PARTIALLY_CANCELLED, PARTIALLY_REFUNDED, REFUNDED, REFUND_REJECTED, REFUND_REQUESTED, WAITING_UPSELL_ACTION
  orderPaymentStatus: OrderPaymentStatusEnum
  orderPackageStatus: OrderPackageStatusEnum
  orderedAt: Timestamp             # ⚠️ Unix ms (number), NOT ISO string
  cancelledAt: Timestamp
  cancelReason: OrderCancelledReasonEnum
  currencyCode: String!
  currencySymbol: String
  totalPrice: Float!               # Sum of line item net prices
  totalFinalPrice: Float!          # After adjustments, shipping, gift packaging
  itemCount: Float
  note: String
  couponCode: String
  archived: Boolean!
  shippingMethod: OrderShippingMethodEnum!

  # Customer
  customer: OrderCustomer
  customerId: String
  customerOrderCount: Float

  # Addresses
  shippingAddress: OrderAddress
  billingAddress: OrderAddress

  # Line Items
  orderLineItems: [OrderLineItem!]!
  orderAdjustments: [OrderAdjustment!]

  # Shipping & Packaging
  shippingLines: [OrderShippingLine!]
  orderPackages: [OrderPackage!]
  orderPackageSequence: Float

  # Payment
  paymentMethods: [OrderPaymentMethod!]
  currencyRates: [OrderCurrencyRate!]!

  # Gift
  isGiftPackage: Boolean
  giftPackageNote: String
  giftPackageLines: [OrderGiftPackageLine!]

  # Tags & Invoices
  orderTagIds: [String!]
  invoices: [Invoice!]

  # Channel & Location
  salesChannel: OrderSalesChannel!
  salesChannelId: String
  stockLocation: OrderStockLocation
  stockLocationId: String
  storefront: OrderStorefront
  storefrontRouting: OrderStorefrontRouting
  priceList: OrderPriceList

  # POS
  branch: OrderBranch
  branchSession: OrderBranchSession
  staff: OrderStaff
  terminalId: String
  createdBy: CartCreatedByEnum

  # Tax
  taxLines: [OrderTaxLine!]

  # Metadata
  clientIp: String
  host: String
  userAgent: String
  merchantId: String!
  lastActivityDate: Timestamp
  dueDate: Timestamp
}
```

## Order Sub-Types

### OrderCustomer
```graphql
type OrderCustomer {
  id: String
  email: String
  firstName: String
  lastName: String
  fullName: String
  phone: String
  isGuestCheckout: Boolean
  notificationsAccepted: Boolean
  preferredLanguage: String
}
```

### OrderAddress
```graphql
type OrderAddress {
  id: String
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
  isDefault: Boolean!
  city: { id, code, name }
  district: { id, code, name }
  country: { id, code, iso2, iso3, name }
  state: { id, code, name }
  region: { id, code, name }
}
```

### OrderLineItem
```graphql
type OrderLineItem {
  id: ID!
  quantity: Float!
  price: Float!                    # Sell price
  discountPrice: Float
  finalPrice: Float                # After discounts
  finalUnitPrice: Float
  unitPrice: Float
  taxValue: Float
  currencyCode: String
  status: OrderLineItemStatusEnum!
  statusUpdatedAt: Timestamp
  stockLocationId: String
  originalOrderLineItemId: String
  variant: OrderLineVariant!
  discount: OrderLineDiscount
  options: [OrderLineOption!]
}
```

### OrderLineVariant
```graphql
type OrderLineVariant {
  id: String
  name: String!
  sku: String
  slug: String
  barcodeList: [String!]
  productId: String
  mainImageId: String
  weight: Float
  hsCode: String
  taxValue: Float
  prices: [OrderLineVariantPrice!]
  categories: [{ id, name, categoryPath }]
  brand: { id, name }
  tags: [{ id, name }]
  variantValues: [{ order, variantTypeId, variantTypeName, variantValueId, variantValueName }]
}
```

### OrderPackage
```graphql
type OrderPackage {
  id: ID!
  orderPackageNumber: String!      # Format: "orderNumber-sequence" (e.g., "1028-1")
  orderPackageFulfillStatus: OrderPackageFulfillStatusEnum!
  orderLineItemIds: [String!]!
  stockLocationId: String!
  note: String
  errorMessage: String
  trackingInfo: {
    barcode: String
    cargoCompany: String
    cargoCompanyId: String
    trackingNumber: String
    trackingLink: String
    isSendNotification: Boolean
  }
}
```

### OrderShippingLine
```graphql
type OrderShippingLine {
  title: String!
  price: Float!
  finalPrice: Float!
  taxValue: Float
  isRefunded: Boolean
  paymentMethod: PaymentMethodTypeEnum
  shippingSettingsId: String
  shippingZoneRateId: String
  priceListId: String
  transactionId: String
}
```

### OrderAdjustment
```graphql
type OrderAdjustment {
  name: String!
  amount: Float!
  amountType: OrderAmountTypeEnum!  # AMOUNT, PERCENTAGE
  type: OrderAdjustmentEnum!        # INCREMENT, DECREMENT
  order: Float!
  campaignId: String
  campaignType: CampaignTypeEnum
  couponId: String
  transactionId: String
  appliedOrderLines: [{ orderLineId, amount, appliedQuantity }]
}
```

## Enum Values

| Enum | Values |
|------|--------|
| **OrderStatusEnum** | `CANCELLED`, `CREATED`, `DRAFT`, `PARTIALLY_CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `REFUND_REJECTED`, `REFUND_REQUESTED`, `WAITING_UPSELL_ACTION` |
| **OrderPaymentStatusEnum** | `FAILED`, `PAID`, `PARTIALLY_PAID`, `WAITING` |
| **OrderPackageStatusEnum** | `CANCELLED`, `CANCEL_REJECTED`, `CANCEL_REQUESTED`, `DELIVERED`, `FULFILLED`, `PARTIALLY_CANCELLED`, `PARTIALLY_DELIVERED`, `PARTIALLY_FULFILLED`, `PARTIALLY_READY_FOR_SHIPMENT`, `PARTIALLY_REFUNDED`, `READY_FOR_PICK_UP`, `READY_FOR_SHIPMENT`, `REFUNDED`, `REFUND_REJECTED`, `REFUND_REQUESTED`, `REFUND_REQUEST_ACCEPTED`, `UNABLE_TO_DELIVER`, `UNFULFILLED` |
| **OrderPackageFulfillStatusEnum** | `CANCELLED`, `CANCEL_REJECTED`, `CANCEL_REQUESTED`, `DELIVERED`, `ERROR`, `FULFILLED`, `READY_FOR_PICK_UP`, `READY_FOR_SHIPMENT`, `REFUNDED`, `REFUND_REJECTED`, `REFUND_REQUESTED`, `REFUND_REQUEST_ACCEPTED`, `UNABLE_TO_DELIVER` |
| **OrderLineItemStatusEnum** | `CANCELLED`, `CANCEL_REJECTED`, `CANCEL_REQUESTED`, `DELIVERED`, `FULFILLED`, `REFUNDED`, `REFUND_REJECTED`, `REFUND_REQUESTED`, `REFUND_REQUEST_ACCEPTED`, `UNFULFILLED` |
| **OrderShippingMethodEnum** | `CLICK_AND_COLLECT`, `DIGITAL_DELIVERY`, `NO_SHIPMENT`, `SHIPMENT` |
| **OrderCancelledReasonEnum** | (varies) |
| **PaymentMethodTypeEnum** | `APP_PAYMENT`, `BANK_REDIRECT`, `BUY_ONLINE_PAY_AT_STORE`, `CASH`, `CASH_ON_DELIVERY`, `CREDIT_CARD`, `CREDIT_CARD_ON_DELIVERY`, `DIRECT_DEBIT`, `GIFT_CARD`, `MONEY_ORDER`, `OTHER`, `PAY_LATER`, `SLICE_IT`, `WALLET` |
| **CartCreatedByEnum** | `ADMIN`, `CUSTOMER`, `UPSELL` |

⚠️ `REFUNDED` and `PENDING` are NOT valid OrderPaymentStatusEnum values (REFUNDED is an order status, not a payment status).

## Queries

### listOrder

```graphql
listOrder(
  id: StringFilterInput
  orderNumber: StringFilterInput
  customerId: StringFilterInput
  customerEmail: StringFilterInput
  status: OrderStatusEnumInputFilter           # { eq: "CREATED" }
  orderPaymentStatus: OrderPaymentStatusEnumInputFilter
  orderPackageStatus: OrderPackageStatusEnumInputFilter
  orderedAt: DateFilterInput                   # { gte: unixMs, lte: unixMs }
  updatedAt: DateFilterInput
  closedAt: DateFilterInput
  salesChannelId: StringFilterInput
  stockLocationId: StringFilterInput
  branchId: StringFilterInput
  branchSessionId: StringFilterInput
  terminalId: StringFilterInput
  orderTagIds: StringFilterInput
  invoicesStoreAppId: StringFilterInput
  shippingMethod: OrderShippingMethodEnumFilterInput
  paymentMethodType: OrderPaymentMethodEnumFilterInput
  search: String                               # Searches order numbers only
  sort: String                                 # e.g., "-orderedAt"
  pagination: PaginationInput
): OrderPaginationResponse!
```

**Response:** `{ count, data: [Order], hasNext, limit, page }`

## Mutations

### updateOrderPackageStatus
Update package status and tracking info:
```graphql
mutation($input: UpdateOrderPackageStatusInput!) {
  updateOrderPackageStatus(input: $input) { id orderNumber orderPackageStatus }
}
```
**Input:** `{ orderId: String!, packages: [{ packageId, status, trackingInfo: { barcode, cargoCompany, trackingNumber, trackingLink, isSendNotification } }] }`

### fulfillOrder
Fulfill order line items into packages:
```graphql
mutation($input: FulFillOrderInput!) {
  fulfillOrder(input: $input) { id orderNumber orderPackageStatus }
}
```
**Input:** `{ orderId, stockLocationId, orderLineItemIds, trackingInfo }`

### cancelFulfillment
Cancel a previously created package:
```graphql
mutation($input: CancelFulfillmentInput!) {
  cancelFulfillment(input: $input) { id orderNumber }
}
```

### refundOrderLine
Refund specific order lines:
```graphql
mutation($input: OrderRefundInput!) {
  refundOrderLine(input: $input) { id orderNumber orderPaymentStatus }
}
```

### createOrderWithTransactions
Create a new order programmatically:
```graphql
mutation($input: CreateOrderWithTransactionsInput!) {
  createOrderWithTransactions(input: $input) { id orderNumber }
}
```

### updateOrderLine
Update order line items:
```graphql
mutation($input: UpdateOrderInput!) {
  updateOrderLine(input: $input) { id orderNumber }
}
```

### updateOrderAddresses
Change billing/shipping addresses:
```graphql
mutation($input: UpdateOrderAddressesInput!) {
  updateOrderAddresses(input: $input) { id orderNumber }
}
```

### addOrderInvoice / cancelOrderLine / addOrderTag / removeOrderTag
Additional order management mutations available.

## Examples

### List orders with full details
```graphql
{
  listOrder(pagination: { limit: 10, page: 1 }, sort: "-orderedAt") {
    count
    data {
      id orderNumber status orderPaymentStatus orderPackageStatus
      orderedAt totalFinalPrice currencyCode
      customer { id email firstName lastName phone }
      shippingAddress {
        firstName lastName phone addressLine1 postalCode
        city { name } district { name } country { name }
      }
      orderLineItems {
        id quantity finalPrice
        variant { id name sku barcodeList }
      }
      orderPackages {
        orderPackageNumber orderPackageFulfillStatus
        trackingInfo { cargoCompany trackingNumber trackingLink }
      }
    }
  }
}
```

### Filter by payment status
```graphql
query($status: OrderPaymentStatusEnumInputFilter, $pagination: PaginationInput) {
  listOrder(orderPaymentStatus: $status, pagination: $pagination) {
    count
    data { orderNumber orderedAt totalFinalPrice orderPaymentStatus }
  }
}
# Variables: { "status": { "eq": "PAID" }, "pagination": { "limit": 50, "page": 1 } }
```

### Update package to shipped
```graphql
mutation {
  updateOrderPackageStatus(input: {
    orderId: "order-uuid"
    packages: [{
      packageId: "package-uuid"
      status: SHIPPED
      trackingInfo: {
        cargoCompany: "UPS"
        trackingNumber: "1Z999AA10123456784"
        trackingLink: "https://ups.com/track?num=1Z999AA10123456784"
        isSendNotification: true
      }
    }]
  }) {
    id orderNumber orderPackageStatus
  }
}
```

### Date range query (last 30 days)
```js
const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
const variables = {
  orderedAt: { gte: thirtyDaysAgo, lte: Date.now() },
  pagination: { limit: 50, page: 1 },
  sort: "-orderedAt"
};
```
