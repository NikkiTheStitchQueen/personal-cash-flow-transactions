import { neon } from "@neondatabase/serverless";
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

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

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
      paidDate: row.paid_date ? isoDate(row.paid_date) : "",
      notes: String(row.notes ?? "")
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

export async function PUT(request: Request) {
  const sql = await getSql();

  if (!sql) {
    return NextResponse.json({ configured: false }, { status: 202 });
  }

  const state = await request.json() as AppState;

  await ensureSchema(sql);

  await sql`
    insert into cash_flow_settings (id, active_month, active_pay_period, updated_at)
    values (1, ${state.activeMonth}, ${state.activePayPeriod}, now())
    on conflict (id) do update set
      active_month = excluded.active_month,
      active_pay_period = excluded.active_pay_period,
      updated_at = now()
  `;

  await sql`delete from cash_flow_transactions`;

  for (const transaction of state.transactions) {
    await sql`
      insert into cash_flow_transactions (
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
        notes,
        updated_at
      )
      values (
        ${transaction.id},
        ${transaction.payPeriod},
        ${transaction.date},
        ${transaction.merchant},
        ${transaction.amount},
        ${transaction.category},
        ${transaction.subcategory},
        ${transaction.expenseType},
        ${transaction.account},
        ${transaction.paid},
        ${transaction.paidDate || null},
        ${transaction.notes},
        now()
      )
    `;
  }

  await sql`delete from cash_flow_recurring_expenses`;

  for (const expense of state.recurringExpenses) {
    await sql`
      insert into cash_flow_recurring_expenses (
        id,
        period_slot,
        merchant,
        amount,
        category,
        subcategory,
        expense_type,
        account,
        updated_at
      )
      values (
        ${expense.id},
        ${expense.periodSlot},
        ${expense.merchant},
        ${expense.amount},
        ${expense.category},
        ${expense.subcategory},
        'Planned',
        ${expense.account},
        now()
      )
    `;
  }

  return NextResponse.json({ configured: true });
}

function isoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}
