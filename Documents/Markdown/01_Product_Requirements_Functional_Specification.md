# 01 — Product Requirements & Functional Specification

## 1. Product Overview
A multi-branch ice-cream ordering and management platform with two primary user contexts:
- **Customer**: Google-login-only customer who browses the branch menu, places orders, tracks order status, and views personal order history.
- **Owner/Branch Operator**: operational role used by a branch/reception and by the global owner. Branch operators manage orders, payments, inventory, offers/coupons, dashboard data, settings, and branch-scoped operations.

The initial product is based on the existing single-page ordering concept in `AayushMandavia/IceCream-Melt`, but the new system must be modular, multi-branch, realtime, and production-oriented.

## 2. Core Principles
- Google Sign-In is mandatory for customers.
- No customer email/password authentication.
- No customer password-reset or email-verification workflow.
- Authentication identity is handled by Firebase Authentication.
- Business data is stored separately in the application database.
- Every operational record is branch-scoped.
- A branch cannot view another branch's operational data.
- The global Owner can view/manage all branches.
- Orders expire automatically after 15 minutes if not confirmed.
- Inventory is deducted only after order confirmation/payment verification.
- Confirmed orders can still be edited by the Owner/Branch Operator within the defined 1-hour editing window.
- Customer order status updates in realtime.
- PDFs/invoices are not stored.
- WhatsApp is currently a dummy UI/workflow only.
- The architecture must support future WhatsApp integration without redesigning core business modules.

## 3. User Contexts

### 3.1 Customer
Capabilities:
- Google login.
- Select branch/menu context.
- Browse products.
- Create order.
- Apply eligible offers/coupons.
- Submit order.
- View order status.
- Receive realtime confirmation.
- View own order history.
- View individual order details.

Restrictions:
- Can only see their own orders/profile.
- Cannot access owner/operator pages.
- Cannot edit inventory, prices, offers, coupons, branches, settings, or other customers' records.
- Cannot choose or change payment confirmation status.

### 3.2 Branch Operator
This is the same operational role as reception; there is no separate reception role.

Capabilities within assigned branch:
- View new/current orders.
- Verify payment.
- Confirm orders.
- Edit orders.
- View branch order history.
- Manage branch products/inventory.
- Refill inventory.
- Adjust stock.
- Manage branch offers/coupons.
- View branch dashboard.
- Manage branch settings according to permissions.
- Use the dummy WhatsApp messaging module.

Restrictions:
- Cannot view another branch's data.
- Cannot manage global branch configuration unless explicitly granted global-owner permissions.

### 3.3 Global Owner
Capabilities:
- All branch-operator capabilities.
- View all branches.
- Switch branch context.
- Manage branches.
- Compare/aggregate branch dashboard data.
- Manage global settings.
- Manage deletion/retention operations.
- Manage branch access and branch configuration.

## 4. Branch Model
Each branch is an isolated operational scope.

Every branch has:
- Branch identity.
- Branch-specific operator access.
- Branch-specific Google identity/account mapping.
- Branch-specific PIN.
- Configurable session timeout.
- Products/inventory.
- Orders.
- Offers.
- Coupons.
- Dashboard data.
- Settings.

The global Owner has cross-branch visibility.

## 5. Authentication and Session Requirements
### Customer
- Firebase Google Sign-In only.
- No password storage.
- No password reset.
- No email verification flow.

### Owner/Branch Operator
- Google-based authentication.
- Branch-specific identity/access mapping.
- Branch-specific PIN.
- PIN/session timeout is configurable in minutes, hours, or days.
- Session must expire according to configured timeout.
- Sensitive operations can require reauthentication/PIN confirmation.

## 6. Order Lifecycle
Recommended state model:
1. `DRAFT`
2. `PLACED`
3. `PENDING_PAYMENT`
4. `CONFIRMED`
5. `EXPIRED`
6. `CANCELLED`
7. `COMPLETED`

Primary flow:
```text
Customer
  -> Login
  -> Select products
  -> Apply offer/coupon
  -> Place order
  -> PENDING_PAYMENT
  -> Branch operator sees order
  -> Customer pays at reception
  -> Operator verifies payment
  -> CONFIRMED
  -> Inventory deducted
  -> Customer receives realtime CONFIRMED status
```

### 15-minute expiry
- Unconfirmed orders expire after 15 minutes.
- Expiration must be server-authoritative.
- Expired orders must not deduct inventory.
- Expired orders cannot be confirmed normally.
- The UI must clearly display expiry status.

### One-hour edit window
- Owner/Branch Operator can edit an order during the configured 1-hour order-edit window.
- Confirmed orders may still be edited.
- Editing must recalculate:
  - line totals
  - discounts
  - coupon eligibility
  - taxes, if configured
  - final total
  - inventory impact
  - payment difference/adjustment state
- All edits must be auditable.

## 7. Payment
Supported payment method is configurable, with initial examples:
- Cash
- Card
- Other/manual methods

Payment confirmation is performed by the branch operator.

The system must store:
- payment method
- amount
- payment status
- confirmation user
- confirmation timestamp
- adjustment/refund/difference information where applicable

## 8. Inventory
The system supports both:
- finished/individual products
- raw materials/ingredients

### Product inventory
Example:
```text
Chocolate Scoop: 100 units
Cone: 200 units
Brownie: 40 units
```

### Raw-material inventory
Example:
```text
Milk
Cream
Sugar
Chocolate
```

Products can optionally consume raw materials through a product-recipe/BOM relationship.

### Deduction
Inventory is deducted after order confirmation, not merely when an order is placed.

### Refill
Operator can record:
- item
- quantity added
- date/time
- source/reason
- operator
- resulting quantity

### Manual adjustment
Operator can:
- increase/decrease stock
- record reason
- create an inventory movement record

Examples:
- damaged
- expired
- wastage
- correction
- manual count

## 9. Dashboard
Dashboard supports:
- Today
- This week
- This month
- Custom date range where appropriate

Metrics:
- order count
- confirmed orders
- pending orders
- expired orders
- cancelled orders
- gross sales/revenue
- average order value
- top products
- category performance
- coupon usage
- offer usage
- inventory alerts
- stock movements

Profit is excluded unless cost-price data is later introduced.

## 10. Order History
### Customer
- Own orders only.
- Default/general history.
- Order detail page.

### Branch Operator
- Today is default.
- Today
- This week
- This month
- Custom range
- Search/filter

### Global Owner
- Same views plus branch selection and all-branch aggregation.

## 11. Offers
Offers are separate from coupons.

Examples:
- Buy 2 get 1
- 20% off a selected product
- Category discount
- Time-based promotion

Offer configuration can include:
- name
- description
- active period
- applicable branches
- products/categories
- discount rule
- minimum order
- maximum discount
- usage limits

## 12. Coupons/Promo Codes
Coupons are manually entered/claimed codes.

Configurable rules:
- code
- discount type
- fixed amount
- percentage
- maximum discount
- minimum order
- start/end date
- total campaign usage
- per-user total usage
- per-user daily usage
- applicable products/categories
- applicable branches
- new-user-only rule if later enabled
- active/inactive state

Usage must be transactionally enforced to prevent double redemption.

## 13. WhatsApp Dummy Module
For now this is only a simulated management feature.

UI should allow:
- audience/category selection
- message composition
- offer association
- preview
- simulated send
- simulated result/status

No real WhatsApp API calls are made.

The architecture should isolate the future provider behind a messaging service interface.

## 14. Data Deletion and Retention
Owner can delete data by:
- date interval
- selected data types
- individual table/module

Default deletion mode:
- all eligible data for the selected date range

Custom mode:
- select individual modules/tables.

Deletion must:
- require explicit confirmation
- show affected scope
- execute dependency-safe deletion
- create an audit record where the audit record itself is retained
- prevent accidental cross-branch deletion unless performed by global Owner
- support dry-run/count-before-delete where practical

## 15. Settings
Settings are divided into:
- branch settings
- owner/global settings
- session/PIN settings
- order settings
- inventory settings
- promotion settings
- data retention/deletion settings
- dummy messaging settings

## 16. Non-Functional Requirements
- Responsive web application.
- Realtime order status.
- Modular frontend/backend/database/API.
- Strong branch isolation.
- Server-authoritative business rules.
- No business-critical rule enforced only in frontend.
- Auditable operational changes.
- Idempotent mutation endpoints where applicable.
- Clear loading/error/empty states.
- Testable modules.
- No duplicated business logic.
- No PDF/bill storage.

## 17. Out of Scope for Current Version
- Real WhatsApp messaging.
- Online payment gateway.
- Customer password authentication.
- Customer password reset.
- Customer email verification.
- Stored invoices/PDFs.
- Advanced accounting/profit calculations unless later added.
