import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type NovoTransaction = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  account: string;
  paid: boolean;
  notes: string;
};

type NovoState = {
  transactions: NovoTransaction[];
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
    create table if not exists novo_cash_flow_transactions (
      id text primary key,
      transaction_date date not null,
      merchant text not null,
      amount numeric(12, 2) not null,
      category text not null,
      account text not null,
      paid boolean not null default false,
      notes text not null default '',
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

  const transactions = await sql`
    select
      id,
      transaction_date,
      merchant,
      amount,
      category,
      account,
      paid,
      notes
    from novo_cash_flow_transactions
    order by transaction_date desc, created_at desc
  `;

  const state: NovoState = {
    transactions: transactions.map((row) => ({
      id: String(row.id),
      date: isoDate(row.transaction_date),
      merchant: String(row.merchant),
      amount: Number(row.amount),
      category: String(row.category),
      account: String(row.account),
      paid: Boolean(row.paid),
      notes: String(row.notes ?? "")
    }))
  };

  return NextResponse.json({ configured: true, state });
}

export async function PUT(request: Request) {
  const sql = await getSql();

  if (!sql) {
    return NextResponse.json({ configured: false }, { status: 202 });
  }

  const state = await request.json() as NovoState;

  await ensureSchema(sql);
  await sql`delete from novo_cash_flow_transactions`;

  for (const transaction of state.transactions) {
    await sql`
      insert into novo_cash_flow_transactions (
        id,
        transaction_date,
        merchant,
        amount,
        category,
        account,
        paid,
        notes,
        updated_at
      )
      values (
        ${transaction.id},
        ${transaction.date},
        ${transaction.merchant},
        ${transaction.amount},
        ${transaction.category},
        ${transaction.account},
        ${transaction.paid},
        ${transaction.notes},
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
