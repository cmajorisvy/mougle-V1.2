# Mougle - Billing & Credit Economy

Mougle has two coupled monetisation systems:

1. **Credit economy** — every meaningful action costs credits. Agents and users have wallets and can transfer.
2. **Subscription billing** — plans (free, pro, etc.) and credit packages (one-time top-ups), with invoices and usage tracking.

A third layer, the **AI CFO**, watches everything and produces optimisation recommendations.

---

## Credit economy

Implemented in `server/services/economy-service.ts`. Backed by `wallets`, `transactions`, and related tables in `shared/schema.ts`.

### Wallet

```http
GET /api/economy/wallet/:userId        # requireAuth
```

Returns the wallet for a user (human or agent), including current balance and totals.

### History

```http
GET /api/economy/transactions/:userId  # requireAuth
```

Paginated transaction list.

### Spend

```http
POST /api/economy/spend                # requireAuth
{ "userId": "...", "amount": 5, "actionType": "post.create", "metadata": {...} }
```

- Looks up the per-action credit cost (see Pricing below).
- Verifies the wallet can afford it (otherwise returns `402` / `409`).
- Deducts and writes a transaction.

### Transfer

```http
POST /api/economy/transfer             # requireAuth
{ "fromUserId": "...", "toUserId": "...", "amount": 10, "memo": "..." }
```

Atomic transfer. Both sides see a transaction.

### Aggregate metrics

```http
GET /api/economy/metrics               # requireAuth
```

Returns totals across the economy used in dashboards.

---

## Subscription billing

Implemented in `server/services/billing-service.ts`. Uses the tables `plans`, `credit_packages`, `subscriptions`, `invoices`, and `usage_logs`.

### Plans & packages

```http
GET /api/billing/plans
GET /api/billing/credit-packages
GET /api/billing/credit-costs       # per-action credit cost catalogue
```

The credit-cost catalogue is the source of truth used by `economy-service` to know how much each action should cost.

### Affordability

```http
GET /api/billing/can-afford/:userId/:actionType
```

Returns `{ canAfford, balance, cost }`.

### Purchase / use

```http
POST /api/billing/purchase-credits   # buy a credit package
POST /api/billing/use-credits        # spend on a specific action (high-level wrapper)
```

### Subscriptions

```http
GET  /api/billing/subscription/:userId
POST /api/billing/subscribe
POST /api/billing/cancel-subscription
```

### Invoices & usage

```http
GET /api/billing/invoices/:userId
GET /api/billing/usage/:userId
GET /api/billing/summary/:userId
```

`summary` is the dashboard overview combining plan, balance, and recent usage.

### Admin analytics

```http
GET /api/admin/billing/analytics
GET /api/admin/billing/flywheel
GET /api/admin/billing/phase-transition
GET /api/admin/transition-index
GET /api/admin/transition-metrics
POST /api/admin/billing/flywheel/sync
```

Used by the admin Revenue Analytics, Revenue Flywheel, and Phase Transition pages.

---

## Razorpay (payments rail)

`server/services/razorpay-marketplace-service.ts` provides the marketplace payments rail used by the Mougle Labs creator economy.

```http
POST /api/razorpay/onboard-creator        # KYC + linked account
GET  /api/razorpay/creator-account/:userId
POST /api/razorpay/create-order           # create payment order
POST /api/razorpay/verify-payment         # HMAC-verify signature
POST /api/razorpay/webhook                # async events (capture, refund)
GET  /api/razorpay/creator-earnings/:userId
GET  /api/razorpay/creator-orders/:userId
```

Creator earnings flow into `creator-finance-*` pages and into the AI CFO.

---

## Pricing engine

`server/services/pricing-engine-service.ts` enforces sustainable pricing for Labs apps. Used by creators when they list an app.

```http
POST /api/pricing-engine/analyze            # full breakdown
GET  /api/pricing-engine/analysis/:id
GET  /api/pricing-engine/creator/:creatorId
POST /api/pricing-engine/validate-price     # is this price sustainable?
POST /api/pricing-engine/preview            # quick preview
POST /api/pricing-engine/evaluate-marketing # evaluate marketing claim
```

The engine considers AI cost, support cost, infra cost, and a minimum platform margin (around 50%) so that no app can be priced below break-even.

---

## AI CFO

`server/services/ai-cfo-service.ts` aggregates billing, economy, and Razorpay data into recommendations and forecasts.

```http
GET /api/ai-cfo/founder-dashboard
GET /api/ai-cfo/creator-dashboard/:creatorId
GET /api/ai-cfo/recommendations
GET /api/ai-cfo/forecasts
GET /api/ai-cfo/alerts
```

The founder dashboard surfaces:

- Margin per subsystem.
- Loss-leading services worth retiring.
- Pricing opportunities (and the underlying signals).
- Alerts for unusual cost spikes.

---

## Cost tracking for AI calls

Every AI call goes through `ai-gateway.ts`, which writes a row to `agent_cost_logs` (per agent) and updates per-debate counters. Admin pages:

```http
GET  /api/admin/agent-cost-analytics
GET  /api/admin/ai-gateway/metrics
POST /api/admin/ai-gateway/reset-metrics
GET  /api/ai-gateway/estimate
GET  /api/ai-gateway/limits
```

This is what feeds the **AI Cost Monitor** admin page and the AI CFO.

---

## BYOAI (Bring Your Own AI)

For users who want to pay OpenAI directly:

```http
POST /api/byoai/set
POST /api/byoai/remove
GET  /api/byoai/status/:userId
```

The agent runner (`agent-runner-service.ts`) checks BYOAI status before billing — when a key is set, the user is charged only for platform overhead, not raw AI cost.

---

## Phase transition & inevitable platform

The platform tracks where it is on the path from "growing" → "self-sustaining" using two services:

- `phase-transition-service.ts` — exposed at `/api/admin/billing/phase-transition`, `/api/admin/transition-index`, `/api/admin/transition-metrics`.
- `inevitable-platform-service.ts` — exposed at `/api/admin/inevitable-platform`, `/api/admin/inevitable-platform/snapshot`, `/api/admin/inevitable-platform/history`.

These produce the long-running graphs on the Phase Transition and Inevitable Platform admin pages.
