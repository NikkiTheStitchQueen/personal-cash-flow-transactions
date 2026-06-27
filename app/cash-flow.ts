export type Transaction = {
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

export type PayPeriodSlot = "PP1" | "PP2";

export type RecurringExpense = {
  id: string;
  periodSlot: PayPeriodSlot;
  merchant: string;
  amount: number;
  category: string;
  subcategory: string;
  expenseType: string;
  account: string;
};

export type AppState = {
  activeMonth: string;
  activePayPeriod: string;
  transactions: Transaction[];
  recurringExpenses: RecurringExpense[];
};

export const STORAGE_KEY = "personal-cash-flow-transactions-v1";

export const accounts = [
  "Chase Checking",
  "Sapphire",
  "Amazon",
  "VZW",
  "Kroger",
  "Paypal"
];

export const categorySubcategories: Record<string, string[]> = {
  Income: ["Income"],
  Bills: ["Car Insurance", "Insurance", "Mortgage", "Student Loans", "Utilities"],
  Car: ["Lexus", "Toyota"],
  Clothing: ["Holden", "Hudson", "Nikki", "Household"],
  Entertainment: ["General", "Subscriptions"],
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

export const categories = Object.keys(categorySubcategories);
export const expenseTypes = ["Planned", "Necessary", "Regret", "Impulse", "Worth It"];
export const startingBalance = -642.74;

export const defaultRecurringExpenses: RecurringExpense[] = [
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

export const initialState: AppState = {
  activeMonth: currentMonth(),
  activePayPeriod: `${currentMonth()}-PP1`,
  transactions: [],
  recurringExpenses: defaultRecurringExpenses
};

export function recurring(
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

export function normalizeState(state: AppState): AppState {
  return {
    ...state,
    transactions: state.transactions.map((transaction) => ({
      ...transaction,
      ...normalizeCategory(transaction.category, transaction.subcategory),
      expenseType: transaction.expenseType ?? "",
      notes: mergedPaidDateNote(transaction),
      paidDate: ""
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

export function loadLocalState() {
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

export function buildPayPeriods(month: string) {
  return [`${month}-PP1`, `${month}-PP2`];
}

export function defaultDateForPayPeriod(payPeriod: string) {
  const [year, month, slot] = payPeriod.split("-");
  const payDate = slot === "PP2"
    ? previousWeekday(new Date(Number(year), Number(month) - 1, 15))
    : previousWeekday(new Date(Number(year), Number(month), 0));

  return isoLocalDate(payDate);
}

export function sum(transactions: Transaction[]) {
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
}

export function compareTransactions(a: Transaction, b: Transaction) {
  const dateOrder = a.date.localeCompare(b.date);

  if (dateOrder !== 0) {
    return dateOrder;
  }

  return categorySortRank(a.category) - categorySortRank(b.category);
}

export function compareRecurringExpenses(a: RecurringExpense, b: RecurringExpense) {
  const categoryOrder = categorySortRank(a.category) - categorySortRank(b.category);

  if (categoryOrder !== 0) {
    return categoryOrder;
  }

  return a.merchant.localeCompare(b.merchant);
}

export function money(value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
  return value < 0 ? `-${formatted}` : formatted;
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatPayPeriod(period: string) {
  const [year, month, payPeriod] = period.split("-");
  const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  return `${label} ${payPeriod}`;
}

export function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric"
  });
}

function mergedPaidDateNote(transaction: Transaction) {
  return transaction.paidDate ? transaction.paidDate : transaction.notes ?? "";
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

function categorySortRank(category: string) {
  if (category === "Income") return 0;
  if (category === "Bills") return 1;
  return 2;
}
