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

type PayPeriodSlot = "PP1" | "PP2";

type RecurringExpense = {
  id: string;
  periodSlot: PayPeriodSlot;
  merchant: string;
  amount: number;
  category: string;
  subcategory: string;
  expenseType: string;
  account: string;
};

type AppState = {
  activeMonth: string;
  activePayPeriod: string;
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
};

type PersistenceTarget = "local" | "database";

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
const startingBalance = -642.74;

const defaultRecurringExpenses: RecurringExpense[] = [
  recurring("PP1", "Netrist Paycheck", 2986.2, "Income", "Income", "Chase Checking"),
  recurring("PP1", "Realtracs Paycheck", 3622.26, "Income", "Income", "Chase Checking"),
  recurring("PP1", "Realtracs Paycheck", 157.5, "Income", "Income", "Chase Checking"),
  recurring("PP1", "Tithe", -500, "Tithe", "General", "Chase Checking"),
  recurring("PP1", "Mortgage", -2294.45, "Bills", "Mortgage", "Chase Checking"),
  recurring("PP1", "Northwestern", -54.35, "Bills", "Insurance", "Chase Checking"),
  recurring("PP1", "Hudson - Afterschool", 90, "Childcare", "After School", "Chase Checking"),
  recurring("PP1", "Hudson - Afterschool", -90, "Childcare", "After School", "Chase Checking"),
  recurring("PP1", "Geico", -760.26, "Bills", "Car Insurance", "Chase Checking"),
  recurring("PP1", "Audible", -16.37, "Entertainment", "Subscriptions", "Amazon"),
  recurring("PP1", "Disney Plus", -21.89, "Entertainment", "Subscriptions", "Sapphire"),
  recurring("PP1", "Pay Down Lexus", -700, "Car", "Lexus", "Chase Checking"),
  recurring("PP1", "Gracie Barra Tuition", -81, "Activities", "Hudson", "Chase Checking"),
  recurring("PP2", "Tithe", -500, "Tithe", "General", "Chase Checking"),
  recurring("PP2", "Banner Insurance", -31.4, "Bills", "Insurance", "Chase Checking"),
  recurring("PP2", "Holden Insurance", -45.12, "Bills", "Insurance", "Chase Checking"),
  recurring("PP2", "Pay Down Lexus", -1500, "Car", "Lexus", "Chase Checking"),
  recurring("PP2", "Car Payment", -683.61, "Car", "Lexus", "Chase Checking"),
  recurring("PP2", "NES", -191, "Bills", "Utilities", "Chase Checking"),
  recurring("PP2", "Comcast", -161.92, "Bills", "Utilities", "Sapphire"),
  recurring("PP2", "Piedmont", -63, "Bills", "Utilities", "Chase Checking"),
  recurring("PP2", "Water", -24.09, "Bills", "Utilities", "Chase Checking"),
  recurring("PP2", "Verizon", -244, "Bills", "Utilities", "VZW"),
  recurring("PP2", "Hudson - After School - 6/12", -90, "Childcare", "After School", "Chase Checking"),
  recurring("PP2", "Hudson - After School - 6/12", -90, "Childcare", "After School", "Chase Checking"),
  recurring("PP2", "JMI - Alexandra Sponsorship - 3/28", -41.3, "Gift", "General", "Chase Checking"),
  recurring("PP2", "Youtube Premium", -29.55, "Entertainment", "Subscriptions", "Amazon"),
  recurring("PP2", "ChatGPT", -21.95, "Entertainment", "Subscriptions", "Sapphire"),
  recurring("PP2", "Rene - Student Loans", -600, "Bills", "Student Loans", "Chase Checking"),
  recurring("PP2", "Gracie Barra Tuition - 6/9", -81, "Activities", "Hudson", "Chase Checking"),
  recurring("PP2", "Gracie Barra Tuition - 6/23", -81, "Activities", "Hudson", "Chase Checking")
];

const initialState: AppState = {
  activeMonth: currentMonth(),
  activePayPeriod: `${currentMonth()}-PP1`,
  transactions: [],
  recurringExpenses: defaultRecurringExpenses
};

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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const [openTransactionDetailsId, setOpenTransactionDetailsId] = useState<string | null>(null);
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

    if (persistenceTarget !== "database") return;

    const timeout = window.setTimeout(async () => {
      try {
        await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state)
        });
      } catch {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [hydrated, persistenceTarget, state]);

  const payPeriods = useMemo(() => buildPayPeriods(state.activeMonth), [state.activeMonth]);
  const recurringExpenseGroups = {
    PP1: state.recurringExpenses.filter((expense) => expense.periodSlot === "PP1").sort(compareRecurringExpenses),
    PP2: state.recurringExpenses.filter((expense) => expense.periodSlot === "PP2").sort(compareRecurringExpenses)
  };
  const visibleTransactions = state.transactions
    .filter((transaction) => transaction.payPeriod === state.activePayPeriod)
    .filter((transaction) =>
      [transaction.merchant, transaction.category, transaction.subcategory, transaction.expenseType, transaction.account, transaction.notes]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort(compareTransactions);

  const periodTransactions = state.transactions.filter((transaction) => transaction.payPeriod === state.activePayPeriod);
  const periodIncome = sum(periodTransactions.filter((transaction) => transaction.amount > 0));
  const plannedExpenses = Math.abs(sum(periodTransactions.filter((transaction) => transaction.expenseType === "Planned" && transaction.amount < 0)));
  const periodSpending = Math.abs(sum(periodTransactions.filter((transaction) => transaction.amount < 0 && transaction.expenseType !== "Planned")));
  const unpaidCount = periodTransactions.filter((transaction) => !transaction.paid).length;
  const transactionCount = periodTransactions.length;
  const balance = startingBalance + sum(state.transactions);

  const accountTotals = accounts.map((account) => {
    const accountTransactions = periodTransactions.filter((transaction) => transaction.account === account);
    const unpaidTransactions = accountTransactions.filter((transaction) => !transaction.paid);
    return {
      account,
      total: sum(unpaidTransactions),
      unpaid: unpaidTransactions.length
    };
  });

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  function openRecurringModal() {
    setRecurringTransactionDates({
      PP1: defaultDateForPayPeriod(`${state.activeMonth}-PP1`),
      PP2: defaultDateForPayPeriod(`${state.activeMonth}-PP2`)
    });
    setIsRecurringModalOpen(true);
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
    const transactionDate = String(form.get("date"));
    const paidDate = paid ? transactionDate : "";

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      payPeriod: String(form.get("payPeriod")),
      date: transactionDate,
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
    event.currentTarget.reset();
    setRecurringCategories((current) => ({ ...current, [periodSlot]: "Income" }));
  }

  function updateRecurringExpense<K extends keyof RecurringExpense>(id: string, key: K, value: RecurringExpense[K]) {
    updateState((current) => ({
      ...current,
      recurringExpenses: current.recurringExpenses.map((expense) => {
        if (expense.id !== id) return expense;
        if (key === "category") {
          const category = String(value);
          return {
            ...expense,
            category,
            subcategory: categorySubcategories[category]?.[0] ?? ""
          };
        }
        return { ...expense, [key]: value };
      })
    }));
  }

  function deleteRecurringExpense(id: string) {
    updateState((current) => ({
      ...current,
      recurringExpenses: current.recurringExpenses.filter((expense) => expense.id !== id)
    }));
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
        paidDate: paid ? transactionDate : "",
        notes: "Recurring"
      };
    });

    updateState((current) => ({
      ...current,
      transactions: [...transactions, ...current.transactions]
    }));
    setIsRecurringModalOpen(false);
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
          <button type="button" className="primary-button quick-add-button" onClick={() => setIsAddModalOpen(true)}>Add transaction</button>
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
          <button type="button" className="ghost-button desktop-recurring-button" onClick={openRecurringModal}>Recurring</button>
          <div className="more-menu">
            <button type="button" className="icon-button" aria-label="More options" title="More options" aria-expanded={showMoreMenu} onClick={() => setShowMoreMenu((current) => !current)}>
              <DotsIcon />
            </button>
            {showMoreMenu && (
              <div className="more-menu-panel">
                <button
                  type="button"
                  className="ghost-button"
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
                <form action="/api/logout" method="post">
                  <button type="submit" className="ghost-button">Log out</button>
                </form>
              </div>
            )}
          </div>
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
            <button type="button" className="ghost-button" onClick={exportCsv}>Export CSV</button>
          </div>
        </section>
      )}

      <section className={showMobileSummary ? "account-strip mobile-summary-open" : "account-strip"} aria-label="Account summary">
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
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th>Account</th>
                  <th>Paid</th>
                  <th>Paid date</th>
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
                        <td className={hasPaidDateError ? "validation-cell" : ""}>
                          <input className="table-input" type="date" value={editingTransaction.paidDate} onChange={(event) => updateEditing("paidDate", event.target.value)} />
                          {hasPaidDateError && <span className="cell-warning">Required</span>}
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
                            <label>
                              Notes
                              <input className="table-input" value={editingTransaction.notes} onChange={(event) => updateEditing("notes", event.target.value)} />
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

                  const needsPaidDateReview = transaction.paid && !transaction.paidDate;
                  const isDetailsOpen = openTransactionDetailsId === transaction.id;

                  return (
                    <tr key={transaction.id}>
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
                      <td className={needsPaidDateReview ? "validation-cell" : ""}>
                        {transaction.paidDate ? formatDate(transaction.paidDate) : needsPaidDateReview ? <span className="cell-warning">Review</span> : ""}
                      </td>
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
                                  <div>
                                    <dt>Notes</dt>
                                    <dd>{transaction.notes || "None"}</dd>
                                  </div>
                                </dl>
                              </div>
                            )}
                          </div>
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
                    <td colSpan={9}><div className="empty-state">No transactions for this pay period yet.</div></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="metric-grid bottom-stats" aria-label="Pay period summary">
        <Metric label="Income" value={money(periodIncome)} tone="good" />
        <Metric label="Planned expenses" value={money(plannedExpenses)} tone="warn" />
        <Metric label="Spending" value={money(periodSpending)} tone="danger" />
        <Metric label="Unpaid items" value={String(unpaidCount)} tone={unpaidCount ? "warn" : "good"} />
        <Metric label="Total transactions" value={String(transactionCount)} tone="good" />
        <Metric label="Balance" value={money(balance)} tone={balance >= 0 ? "good" : "danger"} />
      </section>

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
                  Type of expense
                  <select name="expenseType">
                    <option value="">None</option>
                    {expenseTypes.map((expenseType) => <option key={expenseType}>{expenseType}</option>)}
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
                          <label>
                            Name
                            <input value={expense.merchant} onChange={(event) => updateRecurringExpense(expense.id, "merchant", event.target.value)} />
                          </label>
                          <label>
                            Amount
                            <input type="number" step="0.01" value={expense.amount} onChange={(event) => updateRecurringExpense(expense.id, "amount", Number(event.target.value))} />
                          </label>
                          <label>
                            Category
                            <select value={expense.category} onChange={(event) => updateRecurringExpense(expense.id, "category", event.target.value)}>
                              {categories.map((category) => <option key={category}>{category}</option>)}
                            </select>
                          </label>
                          <label>
                            Subcategory
                            <select value={expense.subcategory} onChange={(event) => updateRecurringExpense(expense.id, "subcategory", event.target.value)}>
                              {(categorySubcategories[expense.category] ?? []).map((subcategory) => <option key={subcategory}>{subcategory}</option>)}
                            </select>
                          </label>
                          <label>
                            Account
                            <select value={expense.account} onChange={(event) => updateRecurringExpense(expense.id, "account", event.target.value)}>
                              {accounts.map((account) => <option key={account}>{account}</option>)}
                            </select>
                          </label>
                          <button type="button" className="delete-button recurring-delete" onClick={() => deleteRecurringExpense(expense.id)}>x</button>
                        </article>
                      ))}
                    </div>
                    <form className="recurring-add-form" onSubmit={(event) => addRecurringExpense(event, periodSlot)}>
                      <h3>Add {periodSlot} recurring item</h3>
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

function recurring(
  periodSlot: PayPeriodSlot,
  merchant: string,
  amount: number,
  category: string,
  subcategory: string,
  account: string
): RecurringExpense {
  return {
    id: crypto.randomUUID(),
    periodSlot,
    merchant,
    amount,
    category,
    subcategory,
    expenseType: "Planned",
    account
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
    })),
    recurringExpenses: (state.recurringExpenses ?? defaultRecurringExpenses).map((expense) => ({
      ...expense,
      ...normalizeCategory(expense.category, expense.subcategory),
      expenseType: "Planned",
      account: accounts.includes(expense.account) ? expense.account : "Chase Checking",
      periodSlot: expense.periodSlot === "PP2" ? "PP2" : "PP1"
    }))
  };
}

function loadLocalState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return normalizeState(JSON.parse(saved) as AppState);
  } catch {
    return null;
  }
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

function defaultDateForPayPeriod(payPeriod: string) {
  const [year, month, slot] = payPeriod.split("-");
  const payDate = slot === "PP2"
    ? previousWeekday(new Date(Number(year), Number(month) - 1, 15))
    : previousWeekday(new Date(Number(year), Number(month), 0));

  return isoLocalDate(payDate);
}

function sum(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

function previousWeekday(date: Date) {
  const weekday = date.getDay();

  if (weekday === 6) {
    date.setDate(date.getDate() - 1);
  } else if (weekday === 0) {
    date.setDate(date.getDate() - 2);
  }

  return date;
}

function isoLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function compareTransactions(a: Transaction, b: Transaction) {
  const dateOrder = a.date.localeCompare(b.date);

  if (dateOrder !== 0) {
    return dateOrder;
  }

  return categorySortRank(a.category) - categorySortRank(b.category);
}

function compareRecurringExpenses(a: RecurringExpense, b: RecurringExpense) {
  const categoryOrder = categorySortRank(a.category) - categorySortRank(b.category);

  if (categoryOrder !== 0) {
    return categoryOrder;
  }

  return a.merchant.localeCompare(b.merchant);
}

function categorySortRank(category: string) {
  if (category === "Income") return 0;
  if (category === "Bills") return 1;
  return 2;
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
