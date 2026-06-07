# Personal Cash Flow Transactions

This is the reset version of the personal cash flow app. It intentionally contains only the transaction screen.

## What It Includes

- Manual transaction entry
- Two pay periods per month, such as `June 2026 PP1` and `June 2026 PP2`
- Accounts from the brief: Chase Checking, Sapphire, Amazon, VZW, Kroger, Paypal
- Categories from the brief
- Positive amounts for income and negative amounts for spending
- Account paid status
- Search, period totals, account summaries
- CSV export and JSON backup/import
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
