"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SofiTransaction = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  account: string;
  paid: boolean;
  notes: string;
};

type SofiState = {
  transactions: SofiTransaction[];
};

type PersistenceTarget = "local" | "database";
type SofiViewFilter = "unpaid" | "all";

const STORAGE_KEY = "personal-cash-flow-sofi-transactions-v1";
const startingBalance = 695.25;
const defaultAccount = "SoFi";
const accounts = ["SoFi", "Paypal", "Sapphire", "Amazon", "VZW"];
const categories = ["Income", "Entertainment", "Crochet", "Cross Stitch", "Personal Care", "Gift", "Clothing"];

const initialState: SofiState = {
  transactions: []
};

export default function SofiTransactionsPage() {
  const [state, setState] = useState<SofiState>(initialState);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<SofiTransaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewFilter, setViewFilter] = useState<SofiViewFilter>("unpaid");
  const [openTransactionDetailsId, setOpenTransactionDetailsId] = useState<string | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [selectedPaymentNote, setSelectedPaymentNote] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [persistenceTarget, setPersistenceTarget] = useState<PersistenceTarget>("local");

  useEffect(() => {
    let isCurrent = true;

    async function loadState() {
      let nextState = loadLocalState();
      let nextPersistenceTarget: PersistenceTarget = "local";

      try {
        const response = await fetch("/api/sofi-state", { cache: "no-store" });

        if (response.ok) {
          const payload = await response.json() as { configured: boolean; state: SofiState | null };

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
        await fetch("/api/sofi-state", {
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

  useEffect(() => {
    setSelectedTransactionIds([]);
    setSelectedPaymentNote("");
  }, [search, viewFilter]);

  const filteredBaseTransactions = viewFilter === "unpaid"
    ? state.transactions.filter((transaction) => !transaction.paid)
    : state.transactions;
  const visibleTransactions = filteredBaseTransactions
    .filter((transaction) =>
      [transaction.merchant, transaction.category, transaction.account, transaction.notes]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .sort(compareTransactions);
  const balance = startingBalance + sum(state.transactions);
  const unpaidTransactions = state.transactions.filter((transaction) => !transaction.paid);
  const unpaidCount = unpaidTransactions.length;
  const selectedTransactions = state.transactions.filter((transaction) => selectedTransactionIds.includes(transaction.id));
  const selectedTotal = sum(selectedTransactions);
  const visibleHeading = viewFilter === "unpaid" ? "Unpaid transactions" : "All transactions";
  const visibleDescription = viewFilter === "unpaid"
    ? `${visibleTransactions.length} unpaid items shown`
    : `${visibleTransactions.length} transactions shown`;
  const accountTotals = useMemo(() => {
    return accounts
      .map((account) => {
        const accountUnpaidTransactions = unpaidTransactions.filter((transaction) => transaction.account === account);
        return {
          account,
          total: sum(accountUnpaidTransactions),
          unpaid: accountUnpaidTransactions.length
        };
      })
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [state.transactions, unpaidTransactions]);

  function updateState(updater: (current: SofiState) => SofiState) {
    setState((current) => updater(current));
  }

  function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveAndAddAnother = submitter?.value === "add-another";
    const form = new FormData(event.currentTarget);
    const category = String(form.get("category"));

    if (!categories.includes(category)) {
      setTransactionError("Select a category.");
      return;
    }

    const transaction: SofiTransaction = {
      id: crypto.randomUUID(),
      date: String(form.get("date")),
      merchant: String(form.get("merchant")).trim(),
      amount: Number(form.get("amount")),
      category,
      account: String(form.get("account") || defaultAccount),
      paid: form.get("paid") === "Yes",
      notes: String(form.get("notes") ?? "").trim()
    };

    updateState((current) => ({
      ...current,
      transactions: [transaction, ...current.transactions]
    }));
    event.currentTarget.reset();
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
  }

  function togglePaid(id: string) {
    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === id ? { ...transaction, paid: !transaction.paid } : transaction
      )
    }));
    setSelectedTransactionIds((current) => current.filter((selectedId) => selectedId !== id));
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
    setSelectedTransactionIds([]);
    setSelectedPaymentNote("");
  }

  function startEditing(transaction: SofiTransaction) {
    setEditingId(transaction.id);
    setEditingTransaction({ ...transaction });
  }

  function updateEditing<K extends keyof SofiTransaction>(key: K, value: SofiTransaction[K]) {
    setEditingTransaction((current) => current ? { ...current, [key]: value } : current);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingTransaction(null);
  }

  function saveEditing() {
    if (!editingTransaction) return;

    updateState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === editingTransaction.id ? normalizeTransaction(editingTransaction) : transaction
      )
    }));
    cancelEditing();
  }

  function exportCsv() {
    const header = ["Date", "Merchant", "Amount", "Category", "Account", "Paid", "Notes"];
    const rows = state.transactions.map((transaction) => [
      transaction.date,
      transaction.merchant,
      transaction.amount,
      transaction.category,
      transaction.account,
      transaction.paid ? "Yes" : "No",
      transaction.notes
    ]);
    download("sofi-transactions.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
  }

  return (
    <main className="screen sofi-screen">
      <header className="app-header">
        <div>
          <p className="eyebrow">SoFi cash flow tracker</p>
          <h1>SoFi Tracker</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="primary-button quick-add-button" onClick={() => setIsAddModalOpen(true)}>Add transaction</button>
        </div>
      </header>

      <section className="toolbar" aria-label="Transaction controls">
        <label>
          Show
          <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value as SofiViewFilter)}>
            <option value="unpaid">Unpaid transactions</option>
            <option value="all">All transactions</option>
          </select>
        </label>
        <label className="search-field">
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Merchant, category, account, notes" />
        </label>
        <div className="filter-actions" aria-label="Data tools">
          <button type="button" className="ghost-button" onClick={exportCsv}>Export CSV</button>
        </div>
      </section>

      <section className="account-strip sofi-account-strip" aria-label="Account summary">
        <article className="account-card balance-card">
          <strong>Balance</strong>
          <span className={balance >= 0 ? "good-text" : "danger-text"}>{money(balance)}</span>
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
            <table className="sofi-table">
              <thead>
                <tr>
                  <th className="select-column">Select</th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Category</th>
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
                              aria-label={`More actions for ${transaction.merchant}`}
                              title="More actions"
                              aria-expanded={isDetailsOpen}
                              onClick={() => setOpenTransactionDetailsId((current) => current === transaction.id ? null : transaction.id)}
                            >
                              <DotsIcon />
                            </button>
                            {isDetailsOpen && (
                              <div className="transaction-detail-panel sofi-action-panel">
                                <button type="button" className="menu-delete-button" onClick={() => deleteTransaction(transaction.id)}>
                                  Delete
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
                    <td colSpan={9}><div className="empty-state">{viewFilter === "unpaid" ? "No unpaid transactions yet." : "No transactions yet."}</div></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="metric-grid sofi-metric-grid bottom-stats" aria-label="SoFi summary">
        <Metric label="Balance" value={money(balance)} tone={balance >= 0 ? "good" : "danger"} />
        <Metric label="Unpaid total" value={money(sum(unpaidTransactions))} tone={sum(unpaidTransactions) >= 0 ? "good" : "danger"} />
        <Metric label="Unpaid items" value={String(unpaidCount)} tone={unpaidCount ? "warn" : "good"} />
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
              <h2 id="add-transaction-title">Add SoFi transaction</h2>
              <button type="button" className="delete-button" onClick={() => setIsAddModalOpen(false)}>x</button>
            </div>
            <form className="entry-panel modal-form add-transaction-form" onSubmit={addTransaction}>
              <div className="field-grid add-transaction-grid">
                <label>
                  Date
                  <input name="date" type="date" defaultValue={todayIso()} required />
                </label>
                <label>
                  Merchant
                  <input name="merchant" type="text" placeholder="Merchant or source" required />
                </label>
                <label>
                  Amount
                  <input name="amount" type="number" step="0.01" placeholder="-82.13 or 3250" required />
                </label>
                <label>
                  Category
                  <select name="category" defaultValue="" required>
                    <option value="">Select category</option>
                    {categories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  Account
                  <select name="account" defaultValue={defaultAccount} required>
                    {accounts.map((account) => <option key={account}>{account}</option>)}
                  </select>
                </label>
                <label>
                  Paid?
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

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

function normalizeState(state: SofiState): SofiState {
  return {
    transactions: (state.transactions ?? []).map(normalizeTransaction)
  };
}

function normalizeTransaction(transaction: SofiTransaction): SofiTransaction {
  const category = categories.includes(transaction.category) ? transaction.category : "Personal Care";
  const account = transaction.account === "Sofi" ? defaultAccount : transaction.account;

  return {
    ...transaction,
    category,
    account: accounts.includes(account) ? account : defaultAccount,
    paid: Boolean(transaction.paid),
    notes: transaction.notes ?? ""
  };
}

function loadLocalState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    return normalizeState(JSON.parse(saved) as SofiState);
  } catch {
    return null;
  }
}

function sum(transactions: SofiTransaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

function compareTransactions(a: SofiTransaction, b: SofiTransaction) {
  const dateOrder = a.date.localeCompare(b.date);

  if (dateOrder !== 0) {
    return dateOrder;
  }

  return a.merchant.localeCompare(b.merchant);
}

function money(value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
  return value < 0 ? `-${formatted}` : formatted;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
