import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

type Sql = NeonQueryFunction<false, false>;

let schemaReady = false;

async function getSql() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    return null;
  }

  return neon(connectionString);
}

async function ensureSchema(sql: Sql) {
  if (schemaReady) return;

  await sql`
    create table if not exists cash_flow_settings (
      id integer primary key default 1 check (id = 1),
      active_month text not null,
      active_pay_period text not null,
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists cash_flow_transactions (
      id text primary key,
      pay_period text not null,
      transaction_date date not null,
      merchant text not null,
      amount numeric(12, 2) not null,
      category text not null,
      subcategory text not null,
      expense_type text not null default '',
      account text not null,
      paid boolean not null default false,
      paid_date date,
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists cash_flow_recurring_expenses (
      id text primary key,
      period_slot text not null check (period_slot in ('PP1', 'PP2')),
      merchant text not null,
      amount numeric(12, 2) not null,
      category text not null,
      subcategory text not null,
      expense_type text not null default 'Planned',
      account text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  schemaReady = true;
}

export async function GET() {
  const sql = await getSql();

  if (!sql) {
    return NextResponse.json({ configured: false, state: null });
  }

  await ensureSchema(sql);

  const [settings] = await sql`
    select active_month, active_pay_period
    from cash_flow_settings
    where id = 1
  `;

  if (!settings) {
    return NextResponse.json({ configured: true, state: null });
  }

  const transactions = await sql`
    select
      id,
      pay_period,
      transaction_date,
      merchant,
      amount,
      category,
      subcategory,
      expense_type,
      account,
      paid,
      paid_date,
      notes
    from cash_flow_transactions
    order by transaction_date desc, created_at desc
  `;

  const recurringExpenses = await sql`
    select
      id,
      period_slot,
      merchant,
      amount,
      category,
      subcategory,
      expense_type,
      account
    from cash_flow_recurring_expenses
    order by period_slot, merchant
  `;

  const state: AppState = {
    activeMonth: String(settings.active_month),
    activePayPeriod: String(settings.active_pay_period),
    transactions: transactions.map((row) => ({
      id: String(row.id),
      payPeriod: String(row.pay_period),
      date: isoDate(row.transaction_date),
      merchant: String(row.merchant),
      amount: Number(row.amount),
      category: String(row.category),
      subcategory: String(row.subcategory),
      expenseType: String(row.expense_type ?? ""),
      account: String(row.account),
      paid: Boolean(row.paid),
      paidDate: "",
      notes: row.paid_date ? isoDate(row.paid_date) : String(row.notes ?? "")
    })),
    recurringExpenses: recurringExpenses.map((row) => ({
      id: String(row.id),
      periodSlot: row.period_slot === "PP2" ? "PP2" : "PP1",
      merchant: String(row.merchant),
      amount: Number(row.amount),
      category: String(row.category),
      subcategory: String(row.subcategory),
      expenseType: "Planned",
      account: String(row.account)
    }))
  };

  return NextResponse.json({ configured: true, state });
}

type StateResource = "transaction" | "recurringExpense" | "settings";

export async function POST(request: Request) {
  const sql = await getSql();

  if (!sql) {
    return NextResponse.json({ configured: false }, { status: 202 });
  }

  const body = await request.json() as { resource?: StateResource; value?: unknown };

  await ensureSchema(sql);

  if (body.resource === "transaction" && isValidTransaction(body.value)) {
    await saveTransaction(sql, body.value);
    return NextResponse.json({ configured: true });
  }

  if (body.resource === "recurringExpense" && isValidRecurringExpense(body.value)) {
    await saveRecurringExpense(sql, body.value);
    return NextResponse.json({ configured: true });
  }

  return NextResponse.json({ configured: true, error: "Invalid row." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const sql = await getSql();

  if (!sql) {
    return NextResponse.json({ configured: false }, { status: 202 });
  }

  const body = await request.json() as { resource?: StateResource; value?: unknown };
  await ensureSchema(sql);

  if (body.resource === "transaction" && isValidTransaction(body.value)) {
    await saveTransaction(sql, body.value);
    return NextResponse.json({ configured: true });
  }

  if (body.resource === "recurringExpense" && isValidRecurringExpense(body.value)) {
    await saveRecurringExpense(sql, body.value);
    return NextResponse.json({ configured: true });
  }

  if (body.resource === "settings" && isValidSettings(body.value)) {
    await sql`
      insert into cash_flow_settings (id, active_month, active_pay_period, updated_at)
      values (1, ${body.value.activeMonth}, ${body.value.activePayPeriod}, now())
      on conflict (id) do update set
        active_month = excluded.active_month,
        active_pay_period = excluded.active_pay_period,
        updated_at = now()
    `;
    return NextResponse.json({ configured: true });
  }

  return NextResponse.json({ configured: true, error: "Invalid row." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const sql = await getSql();

  if (!sql) {
    return NextResponse.json({ configured: false }, { status: 202 });
  }

  const { searchParams } = new URL(request.url);
  const resource = searchParams.get("resource");
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ configured: true, error: "Missing row ID." }, { status: 400 });
  }

  await ensureSchema(sql);

  if (resource === "transaction") {
    await sql`delete from cash_flow_transactions where id = ${id}`;
    return NextResponse.json({ configured: true });
  }

  if (resource === "recurringExpense") {
    await sql`delete from cash_flow_recurring_expenses where id = ${id}`;
    return NextResponse.json({ configured: true });
  }

  return NextResponse.json({ configured: true, error: "Invalid resource." }, { status: 400 });
}

async function saveTransaction(sql: Sql, transaction: Transaction) {
  await sql`
    insert into cash_flow_transactions (
      id, pay_period, transaction_date, merchant, amount, category,
      subcategory, expense_type, account, paid, paid_date, notes, updated_at
    )
    values (
      ${transaction.id}, ${transaction.payPeriod}, ${transaction.date},
      ${transaction.merchant}, ${transaction.amount}, ${transaction.category},
      ${transaction.subcategory}, ${transaction.expenseType}, ${transaction.account},
      ${transaction.paid}, ${null}, ${transaction.paidDate || transaction.notes}, now()
    )
    on conflict (id) do update set
      pay_period = excluded.pay_period,
      transaction_date = excluded.transaction_date,
      merchant = excluded.merchant,
      amount = excluded.amount,
      category = excluded.category,
      subcategory = excluded.subcategory,
      expense_type = excluded.expense_type,
      account = excluded.account,
      paid = excluded.paid,
      paid_date = excluded.paid_date,
      notes = excluded.notes,
      updated_at = now()
  `;
}

async function saveRecurringExpense(sql: Sql, expense: RecurringExpense) {
  await sql`
    insert into cash_flow_recurring_expenses (
      id, period_slot, merchant, amount, category, subcategory,
      expense_type, account, updated_at
    )
    values (
      ${expense.id}, ${expense.periodSlot}, ${expense.merchant}, ${expense.amount},
      ${expense.category}, ${expense.subcategory}, 'Planned', ${expense.account}, now()
    )
    on conflict (id) do update set
      period_slot = excluded.period_slot,
      merchant = excluded.merchant,
      amount = excluded.amount,
      category = excluded.category,
      subcategory = excluded.subcategory,
      expense_type = excluded.expense_type,
      account = excluded.account,
      updated_at = now()
  `;
}

function isValidTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== "object") return false;
  const transaction = value as Partial<Transaction>;

  return typeof transaction.id === "string" && transaction.id.length > 0
    && typeof transaction.merchant === "string" && transaction.merchant.length > 0
    && Number.isFinite(transaction.amount)
    && typeof transaction.payPeriod === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date ?? "")
    && typeof transaction.category === "string"
    && typeof transaction.subcategory === "string"
    && typeof transaction.expenseType === "string"
    && typeof transaction.account === "string"
    && typeof transaction.paid === "boolean";
}

function isValidRecurringExpense(value: unknown): value is RecurringExpense {
  if (!value || typeof value !== "object") return false;
  const expense = value as Partial<RecurringExpense>;

  return typeof expense.id === "string" && expense.id.length > 0
    && typeof expense.merchant === "string" && expense.merchant.length > 0
    && Number.isFinite(expense.amount)
    && (expense.periodSlot === "PP1" || expense.periodSlot === "PP2")
    && typeof expense.category === "string"
    && typeof expense.subcategory === "string"
    && typeof expense.account === "string";
}

function isValidSettings(value: unknown): value is Pick<AppState, "activeMonth" | "activePayPeriod"> {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<AppState>;

  return /^\d{4}-\d{2}$/.test(settings.activeMonth ?? "")
    && typeof settings.activePayPeriod === "string";
}

export async function PUT() {
  return NextResponse.json(
    { configured: true, error: "Full-state replacement is disabled. Save rows individually." },
    { status: 405, headers: { Allow: "GET, POST, PATCH, DELETE" } }
  );
}

function isoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}
