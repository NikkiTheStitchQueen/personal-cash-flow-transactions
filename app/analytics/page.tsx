"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type AppState,
  categories,
  initialState,
  loadLocalState,
  money,
  normalizeState,
  sum
} from "../cash-flow";

type CategorySpend = {
  category: string;
  total: number;
  transactions: number;
};

const excludedAnalyticsAccounts = new Set(["sofi"]);

export default function AnalyticsPage() {
  const [state, setState] = useState<AppState>(initialState);
  const [selectedMonth, setSelectedMonth] = useState(initialState.activeMonth);

  useEffect(() => {
    let isCurrent = true;

    async function loadState() {
      let nextState = loadLocalState();

      try {
        const response = await fetch("/api/state", { cache: "no-store" });

        if (response.ok) {
          const payload = await response.json() as { configured: boolean; state: AppState | null };

          if (payload.configured) {
            nextState = payload.state ? normalizeState(payload.state) : nextState;
          }
        }
      } catch {
      }

      if (!isCurrent) return;

      const hydratedState = nextState ?? initialState;
      setState(hydratedState);
      setSelectedMonth(hydratedState.activeMonth);
    }

    loadState();

    return () => {
      isCurrent = false;
    };
  }, []);

  const months = useMemo(() => {
    const primaryTransactions = state.transactions.filter(isPrimaryAccountTransaction);
    const transactionMonths = primaryTransactions
      .map((transaction) => monthFromDate(transaction.date))
      .filter(Boolean);
    const availableMonths = new Set([
      state.activeMonth,
      selectedMonth,
      ...transactionMonths
    ]);

    return [...availableMonths].sort((a, b) => b.localeCompare(a));
  }, [selectedMonth, state.activeMonth, state.transactions]);

  const monthTransactions = useMemo(() => {
    return state.transactions.filter((transaction) =>
      monthFromDate(transaction.date) === selectedMonth && isPrimaryAccountTransaction(transaction)
    );
  }, [selectedMonth, state.transactions]);

  const spendingTransactions = useMemo(() => {
    return monthTransactions.filter((transaction) => transaction.amount < 0);
  }, [monthTransactions]);

  const incomeTransactions = useMemo(() => {
    return monthTransactions.filter((transaction) => transaction.category === "Income" && transaction.amount > 0);
  }, [monthTransactions]);

  const categoryTotals = useMemo(() => {
    return categories
      .map((category, index) => {
        const transactions = category === "Income"
          ? incomeTransactions
          : spendingTransactions.filter((transaction) => transaction.category === category);
        return {
          category,
          total: category === "Income" ? sum(transactions) : Math.abs(sum(transactions)),
          transactions: transactions.length,
          sortOrder: index
        };
      })
      .sort((a, b) => {
        if (a.category === "Income") return -1;
        if (b.category === "Income") return 1;

        const spendingOrder = b.total - a.total;

        if (spendingOrder !== 0) {
          return spendingOrder;
        }

        return a.sortOrder - b.sortOrder;
      });
  }, [incomeTransactions, spendingTransactions]);

  const totalIncome = sum(incomeTransactions);
  const totalSpending = Math.abs(sum(spendingTransactions));
  const largestCategory = categoryTotals
    .filter((item) => item.category !== "Income")
    .reduce<CategorySpend | null>((largest, current) => {
      if (!largest || current.total > largest.total) {
        return current;
      }

      return largest;
    }, null);
  const spendCategoryCount = categories.length - 1;
  const categoriesWithSpending = categoryTotals.filter((item) => item.category !== "Income" && item.total > 0).length;
  const transactionCount = monthTransactions.length;

  return (
    <main className="screen analytics-screen">
      <header className="app-header">
        <div>
          <p className="eyebrow">Personal cash flow tracker</p>
          <h1>Analytics</h1>
        </div>
        <div className="header-actions">
          <a className="ghost-button nav-button" href="/">Transactions</a>
        </div>
      </header>

      <section className="toolbar analytics-toolbar" aria-label="Analytics controls">
        <label>
          Month
          <select aria-label="Month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {months.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
          </select>
        </label>
      </section>

      <section className="table-panel analytics-panel">
        <div className="panel-heading">
          <div>
            <h2>{formatMonth(selectedMonth)}</h2>
            <p>Income and spending totals by category</p>
          </div>
        </div>
        <div className="category-spend-list">
          {categoryTotals.map((item) => (
            <CategorySpendRow key={item.category} item={item} totalSpending={totalSpending} />
          ))}
        </div>
      </section>

      <section className="metric-grid analytics-metrics" aria-label="Spending summary">
        <AnalyticsMetric label="Income" value={money(totalIncome)} tone="good" />
        <AnalyticsMetric label="Total spending" value={money(totalSpending)} tone="danger" />
        <AnalyticsMetric label="Categories used" value={`${categoriesWithSpending} of ${spendCategoryCount}`} tone="good" />
        <AnalyticsMetric label="Transactions" value={String(transactionCount)} tone="good" />
        <AnalyticsMetric label="Largest category" value={largestCategory ? largestCategory.category : "None"} tone={largestCategory?.total ? "warn" : "good"} />
      </section>
    </main>
  );
}

function isPrimaryAccountTransaction(transaction: { account: string }) {
  return !excludedAnalyticsAccounts.has(transaction.account.trim().toLowerCase());
}

function monthFromDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : "";
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");

  return new Date(Number(year), Number(monthNumber) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function AnalyticsMetric({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "danger" }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong className={`${tone}-text`}>{value}</strong>
    </article>
  );
}

function CategorySpendRow({ item, totalSpending }: { item: CategorySpend; totalSpending: number }) {
  const isIncome = item.category === "Income";
  const percent = isIncome ? item.total > 0 ? 100 : 0 : totalSpending > 0 ? (item.total / totalSpending) * 100 : 0;

  return (
    <article className={isIncome ? "category-spend-row income-row" : "category-spend-row"}>
      <div className="category-spend-heading">
        <div>
          <strong>{item.category}</strong>
          <span>{item.transactions} {item.transactions === 1 ? "transaction" : "transactions"}</span>
        </div>
        <strong className={item.total > 0 ? isIncome ? "good-text" : "danger-text" : "muted-text"}>{money(item.total)}</strong>
      </div>
      <div className={isIncome ? "spend-bar income-bar" : "spend-bar"} aria-label={`${item.category} ${percent.toFixed(0)} percent ${isIncome ? "of income" : "of spending"}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </article>
  );
}
