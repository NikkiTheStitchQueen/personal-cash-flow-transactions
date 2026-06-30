# Personal Cash Flow Transactions

A small personal cash flow tracker built with Next.js. It is designed for manual transaction entry, quick unpaid-balance review, and lightweight analytics across a primary Chase-based tracker plus a separate SoFi tracker.

The app is local-first by default. If a Postgres/Neon connection string is configured, it also persists state to the database.

## What It Includes

- Password-protected access for the tracker routes
- Installable PWA metadata and app icons
- Primary `Chase` tracker at `/`
- Separate `Sofi` tracker at `/sofi`
- Header switch for quickly moving between Chase and Sofi inside the installed PWA
- Analytics dashboard at `/analytics`
- Manual transaction entry, editing, deletion, and paid/unpaid tracking
- Search and filtering for transactions
- Multi-select unpaid transactions and mark them paid together
- CSV export
- Browser local storage fallback for private local-first data

## Primary Tracker

The primary tracker is built around the Chase checking workflow.

- Two pay periods per month, such as `June 2026 PP1` and `June 2026 PP2`
- Accounts: Chase Checking, Sapphire, Amazon, VZW, Kroger, Paypal
- Categories and subcategories
- Optional type of expense: Planned, Necessary, Regret, Impulse, or Worth It
- Positive amounts for income and negative amounts for spending
- Recurring expense templates assigned to PP1 or PP2
- Copy recurring items into the active month/pay period
- Monthly summary metrics for income, planned expenses, spending, unpaid items, and transaction count

## SoFi Tracker

The SoFi tracker has its own simpler transaction model and separate storage.

- Accounts: SoFi, Paypal, Sapphire, Amazon, VZW
- Categories: Income, Entertainment, Crochet, Cross Stitch, Personal Care, Gift, Clothing
- Unpaid/all transaction views
- Balance, unpaid total, and unpaid item summary metrics
- CSV export to `sofi-transactions.csv`

## Analytics

The Analytics page uses the primary tracker data and excludes SoFi account transactions from primary analytics.

- Month selector based on available primary transactions
- Income total from positive `Income` transactions
- Spending totals by category from negative transactions
- Category usage, transaction count, and largest spending category

## Environment Variables

Required:

```bash
CASH_FLOW_TRACKER_PASSWORD=your-password
```

Optional:

```bash
CASH_FLOW_AUTH_SECRET=your-cookie-signing-secret
DATABASE_URL=postgres-or-neon-connection-string
```

`POSTGRES_URL` can be used instead of `DATABASE_URL`.

If no database connection string is provided, the app still runs and saves data in browser local storage. If no tracker password is provided, protected routes redirect to the login page with a missing-password error.

## Run Locally

```bash
npm install --cache .npm-cache
npm run dev
```

Open:

```text
http://localhost:3000
```

If the dev server reports too many open files, use:

```bash
npm run dev:poll
```

## Build

```bash
npm run build
```
