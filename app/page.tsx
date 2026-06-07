"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Transaction = {
  id: string;
  payPeriod: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  subcategory: string;
  expenseType: string;
  account: string;
  paid: boolean;
  paidDate: string;
  notes: string;
};

type AppState = {
  activeMonth: string;
  activePayPeriod: string;
  transactions: Transaction[];
};

const STORAGE_KEY = "personal-cash-flow-transactions-v1";

const accounts = [
  "Chase Checking",
  "Sapphire",
  "Amazon",
  "VZW",
  "Kroger",
  "Paypal"
];

const categorySubcategories: Record<string, string[]> = {
  Income: ["Income"],
  Bills: ["Car Insurance", "Insurance", "Mortgage", "Student Loans", "Utilities"],
  Car: ["Lexus", "Toyota"],
  Clothing: ["Holden", "Hudson", "Nikki", "Household"],
  Entertainment: ["General", "Subscriptions"],
  Fitness: ["General"],
  Food: ["Dining & Misc Food", "Groceries"],
  Gas: ["Vehicle Fuel"],
  Gift: ["General"],
  House: ["General"],
  Activities: ["Holden", "Hudson", "Nikki"],
  Childcare: ["Daycare", "After School"],
  Medical: ["Holden", "Hudson", "Nikki"],
  "Personal Care": ["General"],
  Savings: ["General"],
  Taxes: ["General"],
  Tithe: ["General"],
  Vacation: ["General"],
  "Cash Withdrawal": ["General"]
};

const categories = Object.keys(categorySubcategories);
const expenseTypes = ["Planned", "Necessary", "Regret", "Impulse", "Worth It"];

const initialState: AppState = {
  activeMonth: currentMonth(),
  activePayPeriod: `${currentMonth()}-PP1`,
  transactions: []
};

export default function TransactionsPage() {
  const [state, setState] = useState<AppState>(initialState);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addCategory, setAddCategory] = useState("Income");
  const [showFilters, setShowFilters] = useState(false);
  const [transactionError, setTransactionError] = useState("");
  const [editingError, setEditingError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setState(normalizeState(JSON.parse(saved) as AppState));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [hydrated, state]);

  const payPeriods = useMemo(() => buildPayPeriods(state.activeMonth), [state.activeMonth]);
  const visibleTransactions = state.transactions
    .filter((transaction) => transaction.payPeriod === state.activePayPeriod)
    .filter((transaction) =>
      [transaction.merchant, transaction.category, transaction.subcategory, transaction.expenseType, transaction.account, transaction.notes]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const periodTransactions = state.transactions.filter((transaction) => transaction.payPeriod === state.activePayPeriod);
  const periodIncome = sum(periodTransactions.filter((transaction) => transaction.amount > 0));
  const periodSpending = Math.abs(sum(periodTransactions.filter((transaction) => transaction.amount < 0)));
  const unpaidCount = periodTransactions.filter((transaction) => !transaction.paid).length;
  const netFlow = periodIncome - periodSpending;
  const transactionCount = periodTransactions.length;

  const accountTotals = accounts.map((account) => {
    const accountTransactions = periodTransactions.filter((transaction) => transaction.account === account);
    return {
      account,
      total: sum(accountTransactions),
      unpaid: accountTransactions.filter((transaction) => !transaction.paid).length
    };
  });

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  function changeMonth(month: string) {
    updateState((current) => ({
      ...current,
      activeMonth: month,
      activePayPeriod: `${month}-PP1`
    }));
  }

  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveAndAddAnother = submitter?.value === "add-another";
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const paid = form.get("paid") === "Yes";
    const paidDate = String(form.get("paidDate") ?? "");

    if (paid && !paidDate) {
      setTransactionError("Paid transactions need a paid date.");
      return;
    }

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      payPeriod: String(form.get("payPeriod")),
      date: String(form.get("date")),
      merchant: String(form.get("merchant")).trim(),
      amount,
      category: String(form.get("category")),
      subcategory: String(form.get("subcategory")),
      expenseType: String(form.get("expenseType") ?? ""),
      account: String(form.get("account")),
      paid,
      paidDate,
      notes: String(form.get("notes") ?? "").trim()
    };

    updateState((current) => ({
      ...current,
      transactions: [transaction, ...current.transactions]
    }));
    event.currentTarget.reset();
    setAddCategory("Income");
    setTransactionError("");
    if (!saveAndAddAnother) {
      setIsAddModalOpen(false);
    }
  }

  function deleteTransaction(id: string) {
    updateState((current) => ({
      ...current,
      transactions: current.transactions.filter((transaction) => transaction.id !== id)
    }));
    if (editingId === id) {
      cancelEditing();
    }
  }

  function togglePaid(id: string) {
    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === id ? { ...transaction, paid: !transaction.paid } : transaction
      )
    }));
  }

  function startEditing(transaction: Transaction) {
    setEditingId(transaction.id);
    setEditingTransaction({ ...transaction });
    setEditingError("");
  }

  function updateEditing<K extends keyof Transaction>(key: K, value: Transaction[K]) {
    setEditingTransaction((current) => {
      if (!current) return current;
      if (key === "category") {
        const category = String(value);
        return {
          ...current,
          category,
          subcategory: categorySubcategories[category]?.[0] ?? ""
        };
      }
      return { ...current, [key]: value };
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingTransaction(null);
    setEditingError("");
  }

  function saveEditing() {
    if (!editingTransaction) return;
    if (editingTransaction.paid && !editingTransaction.paidDate) {
      setEditingError("Paid transactions need a paid date.");
      return;
    }

    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === editingTransaction.id ? editingTransaction : transaction
      )
    }));
    cancelEditing();
  }

  function loadExamples() {
    const month = state.activeMonth;
    updateState((current) => ({
      ...current,
      transactions: [
        makeTransaction(`${month}-PP1`, `${month}-01`, "Paycheck", 3250, "Income", "Income", "", "Chase Checking", true),
        makeTransaction(`${month}-PP1`, `${month}-01`, "Kroger", -82.13, "Food", "Groceries", "Necessary", "Sapphire", true),
        makeTransaction(`${month}-PP1`, `${month}-02`, "Netflix", -15.99, "Entertainment", "Subscriptions", "Planned", "Sapphire", false),
        makeTransaction(`${month}-PP1`, `${month}-04`, "VZW", -130, "Bills", "Utilities", "Planned", "VZW", false),
        makeTransaction(`${month}-PP2`, `${month}-16`, "Paycheck", 3250, "Income", "Income", "", "Chase Checking", true),
        makeTransaction(`${month}-PP2`, `${month}-17`, "Mortgage", -1850, "Bills", "Mortgage", "Planned", "Chase Checking", false),
        makeTransaction(`${month}-PP2`, `${month}-18`, "Kids Activities", -260, "Activities", "Hudson", "Planned", "Chase Checking", false)
      ]
    }));
  }

  function exportCsv() {
    const header = ["Pay Period", "Date", "Merchant", "Amount", "Category", "Subcategory", "Type of Expense", "Account", "Account Paid?", "Paid Date", "Notes"];
    const rows = state.transactions.map((transaction) => [
      transaction.payPeriod,
      transaction.date,
      transaction.merchant,
      transaction.amount,
      transaction.category,
      transaction.subcategory,
      transaction.expenseType,
      transaction.account,
      transaction.paid ? "Yes" : "No",
      transaction.paidDate,
      transaction.notes
    ]);
    download("transactions.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
  }

  return (
    <main className="screen">
      <header className="app-header">
        <div>
          <p className="eyebrow">Personal cash flow tracker</p>
          <h1>Spending Tracker</h1>
        </div>
        <div className="header-actions">
          <label className="compact-field">
            Pay period
            <select value={state.activePayPeriod} onChange={(event) => updateState((current) => ({ ...current, activePayPeriod: event.target.value }))}>
              {payPeriods.map((period) => <option key={period} value={period}>{formatPayPeriod(period)}</option>)}
            </select>
          </label>
          <button type="button" className="icon-button" aria-label="Search and filter" title="Search and filter" onClick={() => setShowFilters((current) => !current)}>
            <SearchIcon />
            <FilterIcon />
          </button>
        </div>
      </header>

      {showFilters && (
        <section className="toolbar" aria-label="Transaction controls">
          <label>
            Month
            <input type="month" value={state.activeMonth} onChange={(event) => changeMonth(event.target.value)} />
          </label>
          <label className="search-field">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Merchant, category, account, notes" />
          </label>
          <div className="filter-actions" aria-label="Data tools">
            <button type="button" className="ghost-button" onClick={loadExamples}>Load examples</button>
            <button type="button" className="ghost-button" onClick={exportCsv}>Export CSV</button>
          </div>
        </section>
      )}

      <section className="account-strip" aria-label="Account summary">
        {accountTotals.map((item) => (
          <article className="account-card" key={item.account}>
            <strong>{item.account}</strong>
            <span className={item.total < 0 ? "danger-text" : "good-text"}>{money(item.total)}</span>
            <small>{item.unpaid} unpaid</small>
          </article>
        ))}
      </section>

      <section className="list-section">
        <section className="table-panel">
          <div className="panel-heading">
            <div>
              <h2>{formatPayPeriod(state.activePayPeriod)}</h2>
              <p>{visibleTransactions.length} transactions shown</p>
            </div>
            <button type="button" className="primary-button" onClick={() => setIsAddModalOpen(true)}>Add transaction</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pay period</th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Paid</th>
                  <th>Paid date</th>
                  <th>Notes</th>
                  <th className="actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length ? visibleTransactions.map((transaction) => {
                  const isEditing = editingId === transaction.id && editingTransaction;

                  if (isEditing) {
                    const hasPaidDateError = editingTransaction.paid && !editingTransaction.paidDate;

                    return (
                      <tr className="editing-row" key={transaction.id}>
                        <td>
                          <select className="table-input" value={editingTransaction.payPeriod} onChange={(event) => updateEditing("payPeriod", event.target.value)}>
                            {payPeriods.map((period) => <option key={period} value={period}>{formatPayPeriod(period)}</option>)}
                          </select>
                        </td>
                        <td><input className="table-input" type="date" value={editingTransaction.date} onChange={(event) => updateEditing("date", event.target.value)} /></td>
                        <td><input className="table-input" value={editingTransaction.merchant} onChange={(event) => updateEditing("merchant", event.target.value)} /></td>
                        <td><input className="table-input amount-input" type="number" step="0.01" value={editingTransaction.amount} onChange={(event) => updateEditing("amount", Number(event.target.value))} /></td>
                        <td>
                          <select className="table-input" value={editingTransaction.category} onChange={(event) => updateEditing("category", event.target.value)}>
                            {categories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="table-input" value={editingTransaction.subcategory} onChange={(event) => updateEditing("subcategory", event.target.value)}>
                            {(categorySubcategories[editingTransaction.category] ?? []).map((subcategory) => <option key={subcategory}>{subcategory}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="table-input" value={editingTransaction.expenseType} onChange={(event) => updateEditing("expenseType", event.target.value)}>
                            <option value="">None</option>
                            {expenseTypes.map((expenseType) => <option key={expenseType}>{expenseType}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="table-input" value={editingTransaction.account} onChange={(event) => updateEditing("account", event.target.value)}>
                            {accounts.map((account) => <option key={account}>{account}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="table-input" value={editingTransaction.paid ? "Yes" : "No"} onChange={(event) => updateEditing("paid", event.target.value === "Yes")}>
                            <option>Yes</option>
                            <option>No</option>
                          </select>
                        </td>
                        <td className={hasPaidDateError ? "validation-cell" : ""}>
                          <input className="table-input" type="date" value={editingTransaction.paidDate} onChange={(event) => updateEditing("paidDate", event.target.value)} />
                          {hasPaidDateError && <span className="cell-warning">Required</span>}
                        </td>
                        <td><input className="table-input" value={editingTransaction.notes} onChange={(event) => updateEditing("notes", event.target.value)} /></td>
                        <td className="actions-column">
                          <div className="row-actions">
                            <button type="button" className="icon-button save-icon-button" aria-label="Save transaction" title="Save" onClick={saveEditing}>
                              <CheckIcon />
                            </button>
                            <button type="button" className="icon-button cancel-icon-button" aria-label="Cancel editing" title="Cancel" onClick={cancelEditing}>
                              <XIcon />
                            </button>
                          </div>
                          {editingError && <div className="action-error">{editingError}</div>}
                        </td>
                      </tr>
                    );
                  }

                  const needsPaidDateReview = transaction.paid && !transaction.paidDate;

                  return (
                    <tr key={transaction.id}>
                      <td>{formatPayPeriod(transaction.payPeriod)}</td>
                      <td>{formatDate(transaction.date)}</td>
                      <td>{transaction.merchant}</td>
                      <td className={transaction.amount < 0 ? "danger-text" : "good-text"}>{money(transaction.amount)}</td>
                      <td>{transaction.category}</td>
                      <td>{transaction.subcategory}</td>
                      <td>{transaction.expenseType}</td>
                      <td>{transaction.account}</td>
                      <td>
                        <button type="button" className={transaction.paid ? "status paid" : "status unpaid"} onClick={() => togglePaid(transaction.id)}>
                          {transaction.paid ? "Yes" : "No"}
                        </button>
                      </td>
                      <td className={needsPaidDateReview ? "validation-cell" : ""}>
                        {transaction.paidDate ? formatDate(transaction.paidDate) : needsPaidDateReview ? <span className="cell-warning">Review</span> : ""}
                      </td>
                      <td>{transaction.notes}</td>
                      <td className="actions-column">
                        <div className="row-actions">
                          <button type="button" className="icon-button" aria-label="Edit transaction" title="Edit" onClick={() => startEditing(transaction)}>
                            <PencilIcon />
                          </button>
                          <button type="button" className="delete-button" onClick={() => deleteTransaction(transaction.id)}>x</button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={12}><div className="empty-state">No transactions for this pay period yet.</div></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="metric-grid bottom-stats" aria-label="Pay period summary">
        <Metric label="Income" value={money(periodIncome)} tone="good" />
        <Metric label="Spending" value={money(periodSpending)} tone="danger" />
        <Metric label="Net flow" value={money(netFlow)} tone={netFlow >= 0 ? "good" : "danger"} />
        <Metric label="Unpaid items" value={String(unpaidCount)} tone={unpaidCount ? "warn" : "good"} />
        <Metric label="Transactions" value={String(transactionCount)} tone="good" />
      </section>

      {isAddModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-transaction-title">
            <div className="modal-heading">
              <h2 id="add-transaction-title">Add transaction</h2>
              <button type="button" className="delete-button" onClick={() => setIsAddModalOpen(false)}>x</button>
            </div>
            <form className="entry-panel modal-form" onSubmit={addTransaction}>
              <div className="field-grid">
                <label>
                  Pay period
                  <select name="payPeriod" defaultValue={state.activePayPeriod} required>
                    {payPeriods.map((period) => <option key={period} value={period}>{formatPayPeriod(period)}</option>)}
                  </select>
                </label>
                <label>
                  Date
                  <input name="date" type="date" defaultValue={todayIso()} required />
                </label>
                <label className="span-2">
                  Merchant
                  <input name="merchant" type="text" placeholder="Kroger, Netflix, Paycheck" required />
                </label>
                <label>
                  Amount
                  <input name="amount" type="number" step="0.01" placeholder="-82.13 or 3250" required />
                </label>
                <label>
                  Category
                  <select name="category" value={addCategory} onChange={(event) => setAddCategory(event.target.value)} required>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  Subcategory
                  <select name="subcategory" required>
                    {categorySubcategories[addCategory].map((subcategory) => <option key={subcategory}>{subcategory}</option>)}
                  </select>
                </label>
                <label>
                  Type of expense
                  <select name="expenseType">
                    <option value="">None</option>
                    {expenseTypes.map((expenseType) => <option key={expenseType}>{expenseType}</option>)}
                  </select>
                </label>
                <label>
                  Account
                  <select name="account" required>
                    {accounts.map((account) => <option key={account}>{account}</option>)}
                  </select>
                </label>
                <label>
                  Account paid?
                  <select name="paid" required>
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                </label>
                <label>
                  Paid date
                  <input name="paidDate" type="date" />
                </label>
                <label className="span-2">
                  Notes
                  <input name="notes" type="text" placeholder="Optional" />
                </label>
              </div>
              {transactionError && <div className="form-error">{transactionError}</div>}
              <div className="modal-actions">
                <button className="primary-button" type="submit" value="close">Save transaction</button>
                <button className="ghost-button" type="submit" value="add-another">Save and add another</button>
                <button className="ghost-button" type="button" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}

    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "danger" }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong className={`${tone}-text`}>{value}</strong>
    </article>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function makeTransaction(
  payPeriod: string,
  date: string,
  merchant: string,
  amount: number,
  category: string,
  subcategory: string,
  expenseType: string,
  account: string,
  paid: boolean
): Transaction {
  return {
    id: crypto.randomUUID(),
    payPeriod,
    date,
    merchant,
    amount,
    category,
    subcategory,
    expenseType,
    account,
    paid,
    paidDate: paid ? date : "",
    notes: ""
  };
}

function normalizeState(state: AppState): AppState {
  return {
    ...state,
    transactions: state.transactions.map((transaction) => ({
      ...transaction,
      ...normalizeCategory(transaction.category, transaction.subcategory),
      expenseType: transaction.expenseType ?? "",
      paidDate: transaction.paidDate ?? ""
    }))
  };
}

function normalizeCategory(category: string, subcategory?: string) {
  if (categorySubcategories[category]) {
    return {
      category,
      subcategory: subcategory && categorySubcategories[category].includes(subcategory)
        ? subcategory
        : categorySubcategories[category][0]
    };
  }

  const legacyMap: Record<string, { category: string; subcategory: string }> = {
    Groceries: { category: "Food", subcategory: "Groceries" },
    Dining: { category: "Food", subcategory: "Dining & Misc Food" },
    Gas: { category: "Gas", subcategory: "Vehicle Fuel" },
    Utilities: { category: "Bills", subcategory: "Utilities" },
    Insurance: { category: "Bills", subcategory: "Insurance" },
    Mortgage: { category: "Bills", subcategory: "Mortgage" },
    Entertainment: { category: "Entertainment", subcategory: "General" },
    Income: { category: "Income", subcategory: "Income" },
    Savings: { category: "Savings", subcategory: "General" },
    "Savings Transfer": { category: "Savings", subcategory: "General" },
    "Nikki - Activities": { category: "Activities", subcategory: "Nikki" },
    "Hudson - Activities": { category: "Activities", subcategory: "Hudson" },
    "Hudson - After School Care": { category: "Childcare", subcategory: "After School" }
  };

  return legacyMap[category] ?? { category: "House", subcategory: "General" };
}

function buildPayPeriods(month: string) {
  return [`${month}-PP1`, `${month}-PP2`];
}

function sum(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

function money(value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
  return value < 0 ? `-${formatted}` : formatted;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatPayPeriod(period: string) {
  const [year, month, payPeriod] = period.split("-");
  const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  return `${label} ${payPeriod}`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric"
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
