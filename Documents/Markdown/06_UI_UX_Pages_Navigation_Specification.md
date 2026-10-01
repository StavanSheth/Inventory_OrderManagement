# 06 — UI/UX, Pages, Navigation & Screen Specification

## 1. Page Architecture
The application has two primary UI contexts:
- Customer
- Owner/Branch Operator

The Owner context additionally contains:
- Branch section
- Settings section

Global Owner can switch between branches or all-branch context.

## 2. Customer Navigation
```text
Customer
├── Order
├── Order History
│   ├── All Orders
│   └── Order Details
└── Account
```

## 3. Owner Navigation
```text
Owner
├── Dashboard
├── Current Orders
├── Order History
├── Inventory
│   ├── Products
│   ├── Raw Materials
│   ├── Stock
│   ├── Refill
│   ├── Adjustments
│   └── Movement History
├── Offers
├── Coupons
├── WhatsApp (Dummy)
├── Branches
└── Settings
```

## 4. Customer Pages

### 4.1 Google Login
Purpose:
- authenticate customer

Elements:
- Google Sign-In button
- loading state
- authentication error state

Rules:
- Google login mandatory.
- No password form.
- No password reset.
- No email verification screen.

### 4.2 Order Page
Purpose:
- browse menu and create order

Elements:
- branch context
- categories
- product cards
- quantity controls
- cart
- order summary
- offers
- coupon input
- final total
- place-order button

Rules:
- server validates final price.
- unavailable products cannot be ordered.
- coupon errors are explicit.

### 4.3 Order Status
Shows:
```text
Order placed
Payment pending
Confirmed
Expired
Cancelled
Completed
```

Realtime:
- status changes without manual refresh
- visible countdown for 15-minute expiry while applicable

### 4.4 Order History
Default:
- most recent orders

Filters:
- date
- status

Customer sees only their own orders.

### 4.5 Order Details
Shows:
- order number
- date/time
- items
- quantities
- pricing
- discount
- total
- payment status
- order status
- branch

## 5. Owner Dashboard
Default date range:
- Today

Quick ranges:
- Today
- This week
- This month

Metrics:
- total orders
- confirmed
- pending
- expired
- cancelled
- revenue
- average order value
- top products
- coupon usage
- inventory alerts

Global Owner:
- branch filter
- all-branches option
- branch comparison/aggregate metrics

## 6. Current Orders
Default view:
- active/current orders

Suggested sections:
```text
New
Payment Pending
Confirmed
Recently Edited
Expired
```

Order card:
- order number
- customer
- items summary
- amount
- elapsed time
- expiry countdown
- payment state
- status

Actions:
- view
- edit
- confirm payment
- cancel where permitted

Realtime:
- new orders appear without page refresh
- edits/status changes update live

## 7. Order Edit
Owner/Operator can:
- add product
- remove product
- change quantity
- apply/remove coupon where rules permit
- recalculate total

Must display:
- old total
- new total
- difference
- inventory impact
- payment adjustment state

Requires confirmation before saving.

## 8. Order History
Default:
- Today

Filters:
- Today
- This week
- This month
- custom date range
- status
- payment method
- customer/order search

Global Owner additionally selects branch/all branches.

## 9. Inventory Dashboard
Shows:
- total products
- low stock
- out of stock
- raw-material alerts
- recent movements

## 10. Products
Owner/Operator can:
- create
- edit
- activate/deactivate
- change price
- assign category
- configure stock
- configure raw-material consumption

## 11. Raw Materials
Fields:
- name
- unit
- quantity
- threshold
- active

Actions:
- refill
- adjust
- view history

## 12. Refill
Form:
- item
- quantity
- reason/source
- optional note

Preview:
- previous stock
- added quantity
- new stock

## 13. Inventory Adjustment
Form:
- item
- adjustment type
- quantity
- reason
- note

Examples:
- damage
- waste
- correction
- manual count

## 14. Offers
Separate from coupons.

Management:
- create
- edit
- activate/deactivate
- set dates
- set products/categories
- define discount
- set usage rules

## 15. Coupons
Management:
- code
- name
- fixed/percentage discount
- max discount
- minimum order
- total usage
- per-user usage
- per-user daily usage
- active dates
- products/categories
- branch
- usage history

## 16. WhatsApp Dummy
UI only.

Sections:
- audience
- category/filter selection
- message
- offer association
- preview
- simulated send

Example audience options:
- all customers
- customers who ordered today
- customers who have not ordered recently
- product purchasers
- coupon users
- custom filter

No actual message is sent.

## 17. Branches
Global Owner only.

Functions:
- list branches
- create branch
- edit branch
- activate/deactivate
- configure branch identity
- configure branch Google identity/access
- configure branch PIN
- configure session timeout
- manage branch operators

Each branch has isolated:
- orders
- inventory
- offers
- coupons
- settings
- operational dashboard

## 18. Settings
Sections:
### Authentication/session
- session timeout value
- minutes/hours/days
- PIN configuration

### Orders
- expiry duration (default 15 minutes)
- edit window (default 1 hour)

### Inventory
- thresholds
- stock rules

### Promotions
- default promotion settings

### Data
- retention
- deletion

## 19. Data Deletion
Owner page:
```text
Date range
[ From ] [ To ]

Data:
[x] Orders
[x] Customers
[x] Inventory
[x] Inventory movements
[x] Coupons
[x] Offers
[ ] Other

[Preview]
```

Preview shows:
- number of records affected
- affected branches
- dependent records

Then:
```text
[Confirm Permanent Deletion]
```

Additional mode:
- delete one table/module at a time

## 20. Realtime UX Rules
Customer:
- order status updates live

Branch:
- new order notification/live list
- payment confirmation state
- order edits

Global Owner:
- selected branch/all-branch realtime view according to current context

## 21. Responsive Rules
Customer ordering must prioritize mobile.

Owner dashboard should support:
- desktop/tablet
- mobile operational access

Tables should become:
- cards
- horizontal scroll
- responsive detail views

## 22. UI State Rules
Every data-driven page must define:
- loading
- empty
- error
- success
- permission denied
- offline/retry where relevant

Never show a blank screen while data is loading.

## 23. Confirmation Rules
Require explicit confirmation for:
- payment confirmation
- order edits affecting totals
- stock adjustments
- deletion
- branch deactivation
- coupon/offer deletion
- settings changes with operational impact

## 24. Accessibility
- keyboard-accessible controls
- visible focus states
- semantic labels
- sufficient contrast
- errors associated with fields
- no color-only status indication

## 25. Design System Rules
Create reusable:
- Button
- Input
- Select
- Modal
- Drawer
- Card
- Badge
- Table
- DataTable
- DateRangePicker
- EmptyState
- ErrorState
- LoadingState
- Toast
- ConfirmDialog
- ProductCard
- OrderCard
- StatusBadge
- MetricCard
- ChartContainer

Do not create one-off versions when an existing shared component can be reused.

## 26. Page Count
### Customer
1. Login
2. Order
3. Cart/Order Confirmation
4. Order Status
5. Order History
6. Order Details
7. Account

### Owner/Branch Operator
8. Dashboard
9. Current Orders
10. Order Details/Edit
11. Order History
12. Inventory Dashboard
13. Products
14. Raw Materials
15. Inventory Refill
16. Inventory Adjustment/History
17. Offers
18. Coupons
19. WhatsApp Dummy
20. Branches
21. Branch Details/Access
22. Settings
23. Data Deletion

Total logical pages/screens: approximately **23**, excluding reusable modals/drawers and authentication callbacks.

## 27. Navigation Rule
The frontend must derive available navigation from authenticated application permissions.

Do not merely hide a button and assume the API is protected. Server authorization remains authoritative.
