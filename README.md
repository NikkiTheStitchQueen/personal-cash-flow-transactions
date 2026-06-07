# Personal Cash Flow Transactions

This is the reset version of the personal cash flow app. It intentionally contains only the transaction screen.

## What It Includes

- Manual transaction entry
- Two pay periods per month, such as `June 2026 PP1` and `June 2026 PP2`
- Accounts from the brief: Chase Checking, Sapphire, Amazon, VZW, Kroger, Paypal
- Category and subcategory tracking
- Optional type of expense tracking: Planned, Necessary, Regret, Impulse, or Worth It
- Positive amounts for income and negative amounts for spending
- Account paid status and paid date tracking
- Validation that paid transactions include a paid date
- Search, period totals, account summaries
- CSV export
- Browser local storage for private local-first data

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
