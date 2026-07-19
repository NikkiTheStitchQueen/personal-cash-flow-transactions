"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  type AppState,
  type PayPeriodSlot,
  type RecurringExpense,
  type Transaction,
  STORAGE_KEY,
  accounts,
  buildPayPeriods,
  categories,
  categorySubcategories,
  compareRecurringExpenses,
  compareTransactions,
  defaultDateForPayPeriod,
  expenseTypes,
  formatDate,
  formatPayPeriod,
  initialState,
  loadLocalState,
  money,
  normalizeState,
  startingBalance,
  sum,
  todayIso
} from "./cash-flow";

type PersistenceTarget = "local" | "database";
type TransactionViewFilter = "unpaid" | "month";

export default function TransactionsPage() {
  const [state, setState] = useState<AppState>(initialState);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [addCategory, setAddCategory] = useState("");
  const [recurringCategories, setRecurringCategories] = useState<Record<PayPeriodSlot, string>>({ PP1: "Income", PP2: "Income" });
  const [recurringTransactionDates, setRecurringTransactionDates] = useState<Record<PayPeriodSlot, string>>({
    PP1: defaultDateForPayPeriod(`${initialState.activeMonth}-PP1`),
    PP2: defaultDateForPayPeriod(`${initialState.activeMonth}-PP2`)
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [openTransactionDetailsId, setOpenTransactionDetailsId] = useState<string | null>(null);
  const [transactionViewFilter, setTransactionViewFilter] = useState<TransactionViewFilter>("unpaid");
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [selectedPaymentNote, setSelectedPaymentNote] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [editingError, setEditingError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [persistenceTarget, setPersistenceTarget] = useState<PersistenceTarget>("local");

  useEffect(() => {
    let isCurrent = true;

    async function loadState() {
      let nextState = loadLocalState();
      let nextPersistenceTarget: PersistenceTarget = "local";

      try {
        const response = await fetch("/api/state", { cache: "no-store" });

        if (response.ok) {
          const payload = await response.json() as { configured: boolean; state: AppState | null };

          if (payload.configured) {
            nextPersistenceTarget = "database";
            nextState = payload.state ? normalizeState(payload.state) : nextState;
          }
        }
      } catch {
        nextPersistenceTarget = "local";
      }

      if (!isCurrent) return;

      if (nextState) {
        setState(nextState);
      }
      setPersistenceTarget(nextPersistenceTarget);
      setHydrated(true);
    }

    loadState();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    setSelectedTransactionIds([]);
    setSelectedPaymentNote("");
  }, [search, state.activeMonth, transactionViewFilter]);

  const payPeriods = useMemo(() => buildPayPeriods(state.activeMonth), [state.activeMonth]);
  const recurringExpenseGroups = {
    PP1: state.recurringExpenses.filter((expense) => expense.periodSlot === "PP1").sort(compareRecurringExpenses),
    PP2: state.recurringExpenses.filter((expense) => expense.periodSlot === "PP2").sort(compareRecurringExpenses)
  };
  const filteredBaseTransactions = transactionViewFilter === "month"
    ? state.transactions.filter((transaction) => monthFromDate(transaction.date) === state.activeMonth)
    : state.transactions.filter((transaction) => !transaction.paid);
  const visibleTransactions = filteredBaseTransactions
    .filter((transaction) =>
      [transaction.merchant, transaction.category, transaction.subcategory, transaction.expenseType, transaction.account, transaction.notes]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort(compareTransactions);

  const monthTransactions = state.transactions.filter((transaction) => monthFromDate(transaction.date) === state.activeMonth);
  const monthIncome = sum(monthTransactions.filter((transaction) => transaction.amount > 0));
  const plannedExpenses = Math.abs(sum(monthTransactions.filter((transaction) => transaction.expenseType === "Planned" && transaction.amount < 0)));
  const monthSpending = Math.abs(sum(monthTransactions.filter((transaction) => transaction.amount < 0 && transaction.expenseType !== "Planned")));
  const unpaidCount = monthTransactions.filter((transaction) => !transaction.paid).length;
  const transactionCount = monthTransactions.length;
  const balance = startingBalance + sum(state.transactions);
  const allUnpaidTransactions = state.transactions.filter((transaction) => !transaction.paid);
  const visibleHeading = transactionViewFilter === "month" ? formatMonth(state.activeMonth) : "Unpaid transactions";
  const visibleDescription = transactionViewFilter === "month"
    ? `${visibleTransactions.length} transactions shown`
    : `${visibleTransactions.length} unpaid items across all months`;
  const selectedTransactions = state.transactions.filter((transaction) => selectedTransactionIds.includes(transaction.id));
  const selectedTotal = sum(selectedTransactions);

  const accountTotals = accounts.map((account) => {
    const unpaidTransactions = allUnpaidTransactions.filter((transaction) => transaction.account === account);
    const total = sum(unpaidTransactions);
    return {
      account,
      total,
      unpaid: unpaidTransactions.length
    };
  }).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  async function persistRow(method: "POST" | "PATCH", resource: "transaction" | "recurringExpense" | "settings", value: unknown) {
    if (persistenceTarget !== "database") return;

    try {
      const response = await fetch("/api/state", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, value })
      });

      if (!response.ok) throw new Error("Save failed");
    } catch {
      setTransactionError("This change is saved on this device but could not be saved to the database.");
    }
  }

  async function persistDelete(resource: "transaction" | "recurringExpense", id: string) {
    if (persistenceTarget !== "database") return;

    try {
      const response = await fetch(`/api/state?resource=${resource}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
    } catch {
      setTransactionError("This item was removed on this device but could not be removed from the database.");
    }
  }

  function openRecurringModal() {
    setRecurringTransactionDates({
      PP1: defaultDateForPayPeriod(`${state.activeMonth}-PP1`),
      PP2: defaultDateForPayPeriod(`${state.activeMonth}-PP2`)
    });
    setIsRecurringModalOpen(true);
  }

  function changeMonth(month: string) {
    const settings = {
      activeMonth: month,
      activePayPeriod: `${month}-PP1`
    };
    updateState((current) => ({
      ...current,
      ...settings
    }));
    void persistRow("PATCH", "settings", settings);
  }

  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveAndAddAnother = submitter?.value === "add-another";
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const paid = form.get("paid") === "Yes";
    const transactionDate = String(form.get("date"));

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      payPeriod: fallbackPayPeriodForDate(transactionDate, state.activeMonth),
      date: transactionDate,
      merchant: String(form.get("merchant")).trim(),
      amount,
      category: String(form.get("category")),
      subcategory: String(form.get("subcategory")),
      expenseType: String(form.get("expenseType") ?? ""),
      account: String(form.get("account")),
      paid,
      paidDate: "",
      notes: String(form.get("notes") ?? "").trim()
    };

    updateState((current) => ({
      ...current,
      transactions: [transaction, ...current.transactions]
    }));
    void persistRow("POST", "transaction", transaction);
    event.currentTarget.reset();
    setAddCategory("");
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
    setSelectedTransactionIds((current) => current.filter((selectedId) => selectedId !== id));
    if (editingId === id) {
      cancelEditing();
    }
    void persistDelete("transaction", id);
  }

  function togglePaid(id: string) {
    const transaction = state.transactions.find((item) => item.id === id);
    if (!transaction) return;
    const updatedTransaction = { ...transaction, paid: !transaction.paid };
    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === id ? updatedTransaction : transaction
      )
    }));
    setSelectedTransactionIds((current) => current.filter((selectedId) => selectedId !== id));
    void persistRow("PATCH", "transaction", updatedTransaction);
  }

  function toggleTransactionSelection(id: string) {
    setSelectedTransactionIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function markSelectedPaid() {
    const selectedIds = new Set(selectedTransactionIds);
    const paymentNote = selectedPaymentNote.trim();

    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        selectedIds.has(transaction.id) ? { ...transaction, paid: true, notes: paymentNote } : transaction
      )
    }));
    selectedTransactions.forEach((transaction) => {
      void persistRow("PATCH", "transaction", { ...transaction, paid: true, notes: paymentNote });
    });
    setSelectedTransactionIds([]);
    setSelectedPaymentNote("");
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

    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === editingTransaction.id ? editingTransaction : transaction
      )
    }));
    void persistRow("PATCH", "transaction", editingTransaction);
    cancelEditing();
  }

  function addRecurringExpense(event: FormEvent<HTMLFormElement>, periodSlot: PayPeriodSlot) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expense: RecurringExpense = {
      id: crypto.randomUUID(),
      periodSlot,
      merchant: String(form.get("merchant")).trim(),
      amount: Number(form.get("amount")),
      category: String(form.get("category")),
      subcategory: String(form.get("subcategory")),
      expenseType: "Planned",
      account: String(form.get("account"))
    };

    updateState((current) => ({
      ...current,
      recurringExpenses: [...current.recurringExpenses, expense]
    }));
    void persistRow("POST", "recurringExpense", expense);
    event.currentTarget.reset();
    setRecurringCategories((current) => ({ ...current, [periodSlot]: "Income" }));
  }

  function updateRecurringExpense<K extends keyof RecurringExpense>(id: string, key: K, value: RecurringExpense[K]) {
    const existingExpense = state.recurringExpenses.find((expense) => expense.id === id);
    if (!existingExpense) return;
    const updatedExpense = key === "category"
      ? {
          ...existingExpense,
          category: String(value),
          subcategory: categorySubcategories[String(value)]?.[0] ?? ""
        }
      : { ...existingExpense, [key]: value };
    updateState((current) => ({
      ...current,
      recurringExpenses: current.recurringExpenses.map((expense) => expense.id === id ? updatedExpense : expense)
    }));
  }

  function saveRecurringExpense(id: string) {
    const expense = state.recurringExpenses.find((item) => item.id === id);
    if (expense) void persistRow("PATCH", "recurringExpense", expense);
  }

  function deleteRecurringExpense(id: string) {
    updateState((current) => ({
      ...current,
      recurringExpenses: current.recurringExpenses.filter((expense) => expense.id !== id)
    }));
    void persistDelete("recurringExpense", id);
  }

  function addRecurringToPayPeriod(periodSlot: PayPeriodSlot) {
    const payPeriod = `${state.activeMonth}-${periodSlot}`;
    const transactionDate = recurringTransactionDates[periodSlot] || defaultDateForPayPeriod(payPeriod);
    const transactions = recurringExpenseGroups[periodSlot].map((expense) => {
      const paid = expense.amount > 0;
      return {
        id: crypto.randomUUID(),
        payPeriod,
        date: transactionDate,
        merchant: expense.merchant,
        amount: expense.amount,
        category: expense.category,
        subcategory: expense.subcategory,
        expenseType: expense.expenseType,
        account: expense.account,
        paid,
        paidDate: "",
        notes: ""
      };
    });

    updateState((current) => ({
      ...current,
      transactions: [...transactions, ...current.transactions]
    }));
    transactions.forEach((transaction) => {
      void persistRow("POST", "transaction", transaction);
    });
    setIsRecurringModalOpen(false);
  }

  function exportCsv() {
    const header = ["Pay Period", "Date", "Merchant", "Amount", "Category", "Subcategory", "Type of Expense", "Account", "Account Paid?", "Notes"];
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
      transaction.notes
    ]);
    download("transactions.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
  }

  return (
    <main className="screen">
      <header className="app-header">
        <div className="header-actions">
          <img className="app-logo" src="/android-chrome-192x192.png" alt="Cash Flow" />
          <div className="account-menu">
            <button
              type="button"
              className="account-menu-button"
              aria-label="Switch account tracker"
              aria-expanded={showAccountMenu}
              onClick={() => {
                setShowAccountMenu((current) => !current);
                setShowMoreMenu(false);
              }}
            >
              <span>
                <small>Account</small>
                Chase
              </span>
              <ChevronDownIcon />
            </button>
            {showAccountMenu && (
              <div className="account-menu-panel">
                <a className="active" href="/" aria-current="page">Chase</a>
                <a href="/sofi">SoFi</a>
                <a href="/novo">Novo</a>
                <form action="/api/logout" method="post">
                  <button type="submit">Log out</button>
                </form>
              </div>
            )}
          </div>
          <button type="button" className="primary-button quick-add-button" onClick={() => setIsAddModalOpen(true)}>Add transaction</button>
          <article className="account-card balance-card mobile-balance-card">
            <strong>Balance</strong>
            <BalanceAmount hydrated={hydrated} balance={balance} />
            <small>Available to spend</small>
          </article>
          <button type="button" className="icon-button" aria-label="Search and filter" title="Search and filter" onClick={() => setShowFilters((current) => !current)}>
            <SearchIcon />
            <FilterIcon />
          </button>
          <div className="more-menu">
            <button
              type="button"
              className="icon-button"
              aria-label="More options"
              title="More options"
              aria-expanded={showMoreMenu}
              onClick={() => {
                setShowMoreMenu((current) => !current);
                setShowAccountMenu(false);
              }}
            >
              <DotsIcon />
            </button>
            {showMoreMenu && (
              <div className="more-menu-panel">
                <a className="ghost-button" href="/analytics">Analytics</a>
                <button
                  type="button"
                  className="ghost-button desktop-hidden-menu-item"
                  onClick={() => {
                    setShowMobileSummary((current) => !current);
                    setShowMoreMenu(false);
                  }}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    openRecurringModal();
                    setShowMoreMenu(false);
                  }}
                >
                  Recurring
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showFilters && (
        <section className="toolbar" aria-label="Transaction controls">
          <label>
            Show
            <select value={transactionViewFilter} onChange={(event) => setTransactionViewFilter(event.target.value as TransactionViewFilter)}>
              <option value="unpaid">Unpaid items</option>
              <option value="month">Selected month</option>
            </select>
          </label>
          <label>
            Month
            <input type="month" value={state.activeMonth} onChange={(event) => changeMonth(event.target.value)} />
          </label>
          <label className="search-field">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Merchant, category, account, notes" />
          </label>
          <div className="filter-actions" aria-label="Data tools">
            <button type="button" className="ghost-button" onClick={exportCsv}>Export CSV</button>
          </div>
        </section>
      )}

      <section className={showMobileSummary ? "account-strip mobile-summary-open" : "account-strip"} aria-label="Account summary">
        <article className="account-card balance-card desktop-balance-card">
          <strong>Balance</strong>
          <BalanceAmount hydrated={hydrated} balance={balance} />
          <small>Available to spend</small>
        </article>
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
              <h2>{visibleHeading}</h2>
              <p>{visibleDescription}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="select-column">Select</th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th>Account</th>
                  <th>Paid</th>
                  <th>Notes</th>
                  <th className="actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length ? visibleTransactions.map((transaction) => {
                  const isEditing = editingId === transaction.id && editingTransaction;

                  if (isEditing) {
                    return (
                      <tr className="editing-row" key={transaction.id}>
                        <td className="select-column">
                          <input type="checkbox" checked={selectedTransactionIds.includes(transaction.id)} disabled aria-label={`Select ${transaction.merchant}`} readOnly />
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
                        <td>
                          <input className="table-input" value={editingTransaction.notes} onChange={(event) => updateEditing("notes", event.target.value)} />
                        </td>
                        <td className="actions-column">
                          <div className="row-detail-fields">
                            <label>
                              Type
                              <select className="table-input" value={editingTransaction.expenseType} onChange={(event) => updateEditing("expenseType", event.target.value)}>
                                <option value="">None</option>
                                {expenseTypes.map((expenseType) => <option key={expenseType}>{expenseType}</option>)}
                              </select>
                            </label>
                          </div>
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

                  const isDetailsOpen = openTransactionDetailsId === transaction.id;

                  return (
                    <tr key={transaction.id}>
                      <td className="select-column">
                        <input
                          type="checkbox"
                          checked={selectedTransactionIds.includes(transaction.id)}
                          aria-label={`Select ${transaction.merchant}`}
                          onChange={() => toggleTransactionSelection(transaction.id)}
                        />
                      </td>
                      <td>{formatDate(transaction.date)}</td>
                      <td>{transaction.merchant}</td>
                      <td className={transaction.amount < 0 ? "danger-text" : "good-text"}>{money(transaction.amount)}</td>
                      <td>{transaction.category}</td>
                      <td>{transaction.subcategory}</td>
                      <td>{transaction.account}</td>
                      <td>
                        <button type="button" className={transaction.paid ? "status paid" : "status unpaid"} onClick={() => togglePaid(transaction.id)}>
                          {transaction.paid ? "Yes" : "No"}
                        </button>
                      </td>
                      <td>{transaction.notes}</td>
                      <td className="actions-column">
                        <div className="row-actions">
                          <div className="transaction-detail-menu">
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`More details for ${transaction.merchant}`}
                              title="More details"
                              aria-expanded={isDetailsOpen}
                              onClick={() => setOpenTransactionDetailsId((current) => current === transaction.id ? null : transaction.id)}
                            >
                              <DotsIcon />
                            </button>
                            {isDetailsOpen && (
                              <div className="transaction-detail-panel">
                                <dl>
                                  <div>
                                    <dt>Type</dt>
                                    <dd>{transaction.expenseType || "None"}</dd>
                                  </div>
                                </dl>
                                <button type="button" className="menu-delete-button" onClick={() => deleteTransaction(transaction.id)}>
                                  Delete transaction
                                </button>
                              </div>
                            )}
                          </div>
                          <button type="button" className="icon-button" aria-label="Edit transaction" title="Edit" onClick={() => startEditing(transaction)}>
                            <PencilIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={10}><div className="empty-state">{transactionViewFilter === "month" ? "No transactions for this month yet." : "No unpaid transactions yet."}</div></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="metric-grid bottom-stats" aria-label="Monthly summary">
        <Metric label="Income" value={money(monthIncome)} tone="good" />
        <Metric label="Planned expenses" value={money(plannedExpenses)} tone="warn" />
        <Metric label="Spending" value={money(monthSpending)} tone="danger" />
        <Metric label="Unpaid items" value={String(unpaidCount)} tone={unpaidCount ? "warn" : "good"} />
        <Metric label="Total transactions" value={String(transactionCount)} tone="good" />
      </section>

      {selectedTransactions.length > 0 && (
        <section className="selection-bar" aria-label="Selected transactions total">
          <div>
            <span>{selectedTransactions.length} selected</span>
            <strong className={selectedTotal < 0 ? "danger-text" : "good-text"}>{money(selectedTotal)}</strong>
          </div>
          <label className="selection-note-field">
            Notes
            <input
              value={selectedPaymentNote}
              onChange={(event) => setSelectedPaymentNote(event.target.value)}
              type="text"
              placeholder="Payment date or memo"
            />
          </label>
          <div className="selection-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setSelectedTransactionIds([]);
                setSelectedPaymentNote("");
              }}
            >
              Clear
            </button>
            <button type="button" className="primary-button" onClick={markSelectedPaid}>Mark Selected Paid</button>
          </div>
        </section>
      )}

      {isAddModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-transaction-title">
            <div className="modal-heading">
              <h2 id="add-transaction-title">Add transaction</h2>
              <button type="button" className="delete-button" onClick={() => setIsAddModalOpen(false)}>x</button>
            </div>
            <form className="entry-panel modal-form add-transaction-form" onSubmit={addTransaction}>
              <div className="field-grid add-transaction-grid">
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
                    <option value="">Select category</option>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  Subcategory
                  <select key={addCategory} name="subcategory" defaultValue="" required disabled={!addCategory}>
                    <option value="">Select subcategory</option>
                    {(categorySubcategories[addCategory] ?? []).map((subcategory) => <option key={subcategory}>{subcategory}</option>)}
                  </select>
                </label>
                <label>
                  Account
                  <select name="account" defaultValue="" required>
                    <option value="">Select account</option>
                    {accounts.map((account) => <option key={account}>{account}</option>)}
                  </select>
                </label>
                <label>
                  Account paid?
                  <select name="paid" defaultValue="No" required>
                    <option>No</option>
                    <option>Yes</option>
                  </select>
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

      {isRecurringModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel wide-modal" role="dialog" aria-modal="true" aria-labelledby="recurring-title">
            <div className="modal-heading">
              <div>
                <h2 id="recurring-title">Recurring expenses</h2>
                <p>{state.recurringExpenses.length} recurring items</p>
              </div>
              <button type="button" className="delete-button" onClick={() => setIsRecurringModalOpen(false)}>x</button>
            </div>

            <div className="recurring-content">
              <div className="recurring-list">
                {(["PP1", "PP2"] as PayPeriodSlot[]).map((periodSlot) => (
                  <section className="recurring-group" key={periodSlot} aria-labelledby={`recurring-${periodSlot}`}>
                    <div className="recurring-group-heading">
                      <div>
                        <h3 id={`recurring-${periodSlot}`}>{periodSlot}</h3>
                        <span>{recurringExpenseGroups[periodSlot].length} items</span>
                      </div>
                      <div className="recurring-group-controls">
                        <label className="recurring-date-field">
                          Transaction date
                          <input
                            type="date"
                            value={recurringTransactionDates[periodSlot]}
                            onChange={(event) => setRecurringTransactionDates((current) => ({ ...current, [periodSlot]: event.target.value }))}
                          />
                        </label>
                        <button type="button" className="primary-button" onClick={() => addRecurringToPayPeriod(periodSlot)}>
                          Add {periodSlot} expenses
                        </button>
                      </div>
                    </div>
                    <div className="recurring-group-list">
                      {recurringExpenseGroups[periodSlot].map((expense) => (
                        <article className="recurring-row" key={expense.id}>
                          <input
                            className="recurring-name-input"
                            aria-label={`${expense.merchant} title`}
                            value={expense.merchant}
                            onChange={(event) => updateRecurringExpense(expense.id, "merchant", event.target.value)}
                            onBlur={() => saveRecurringExpense(expense.id)}
                          />
                          <input
                            className="recurring-amount-input"
                            aria-label={`${expense.merchant} amount`}
                            type="number"
                            step="0.01"
                            value={expense.amount}
                            onChange={(event) => updateRecurringExpense(expense.id, "amount", Number(event.target.value))}
                            onBlur={() => saveRecurringExpense(expense.id)}
                          />
                          <div className="recurring-meta">
                            <span>{expense.category}/{expense.subcategory}</span>
                            <small>{expense.account}</small>
                          </div>
                          <button type="button" aria-label={`Delete ${expense.merchant}`} className="delete-button recurring-delete" onClick={() => deleteRecurringExpense(expense.id)}>x</button>
                        </article>
                      ))}
                    </div>
                    <details className="recurring-add-details">
                      <summary>Add recurring item</summary>
                      <form className="recurring-add-form" onSubmit={(event) => addRecurringExpense(event, periodSlot)}>
                        <div className="field-grid">
                        <label>
                          Name
                          <input name="merchant" required />
                        </label>
                        <label>
                          Amount
                          <input name="amount" type="number" step="0.01" required />
                        </label>
                        <label>
                          Category
                          <select
                            name="category"
                            value={recurringCategories[periodSlot]}
                            onChange={(event) => setRecurringCategories((current) => ({ ...current, [periodSlot]: event.target.value }))}
                            required
                          >
                            {categories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </label>
                        <label>
                          Subcategory
                          <select name="subcategory" required>
                            {categorySubcategories[recurringCategories[periodSlot]].map((subcategory) => <option key={subcategory}>{subcategory}</option>)}
                          </select>
                        </label>
                        <label>
                          Account
                          <select name="account" required>
                            {accounts.map((account) => <option key={account}>{account}</option>)}
                          </select>
                        </label>
                        </div>
                        <button className="primary-button" type="submit">Save {periodSlot} item</button>
                      </form>
                    </details>
                  </section>
                ))}
              </div>
            </div>
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

function BalanceAmount({ hydrated, balance }: { hydrated: boolean; balance: number }) {
  if (!hydrated) {
    return <span className="skeleton-text skeleton-balance" aria-label="Loading balance" />;
  }

  return <span className={balance >= 0 ? "good-text" : "danger-text"}>{money(balance)}</span>;
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h.01" />
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
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

function fallbackPayPeriodForDate(date: string, fallbackMonth: string) {
  const month = monthFromDate(date) || fallbackMonth;

  return `${month}-PP1`;
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
