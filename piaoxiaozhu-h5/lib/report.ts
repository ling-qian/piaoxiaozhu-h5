import { CATEGORIES } from "./constants";

export interface ReportData {
  totalIncome: number;
  totalExpense: number;
  grossProfit: number;
  grossMargin: number;
  categoryBreakdown: {
    code: string;
    name: string;
    amount: number;
    percentage: number;
  }[];
  monthlyData: {
    month: string;
    income: number;
    expense: number;
  }[];
}

interface RecordForReport {
  direction: string;
  amount: number | { toNumber: () => number };
  categoryCode: string;
  invoiceDate: string | null;
}

function toNumber(val: number | { toNumber: () => number }): number {
  return typeof val === "number" ? val : val.toNumber();
}

function yuanToCents(yuan: number | { toNumber: () => number }): number {
  return Math.round(toNumber(yuan) * 100);
}

function centsToYuan(cents: number): number {
  return Math.round(cents) / 100;
}

export function generateReport(
  records: RecordForReport[],
  monthFilter?: string
): ReportData {
  let filtered = records;
  if (monthFilter) {
    filtered = records.filter((r) => {
      if (!r.invoiceDate) return false;
      return r.invoiceDate.startsWith(monthFilter);
    });
  }

  let incomeCents = 0;
  let expenseCents = 0;
  const categoryCents: Record<string, number> = {};
  const monthlyCents: Record<string, { income: number; expense: number }> = {};

  for (const r of filtered) {
    const amountCents = yuanToCents(r.amount);

    if (r.direction === "income") {
      incomeCents += amountCents;
    } else {
      expenseCents += amountCents;
      categoryCents[r.categoryCode] =
        (categoryCents[r.categoryCode] || 0) + amountCents;
    }

    if (r.invoiceDate) {
      const month = r.invoiceDate.substring(0, 7);
      if (!monthlyCents[month]) {
        monthlyCents[month] = { income: 0, expense: 0 };
      }
      if (r.direction === "income") {
        monthlyCents[month].income += amountCents;
      } else {
        monthlyCents[month].expense += amountCents;
      }
    }
  }

  const grossProfitCents = incomeCents - expenseCents;
  const grossMargin =
    incomeCents > 0
      ? Math.round((grossProfitCents / incomeCents) * 10000) / 100
      : 0;

  const categoryBreakdown = CATEGORIES.map((cat) => {
    const cents = categoryCents[cat.code] || 0;
    return {
      code: cat.code,
      name: cat.name,
      amount: centsToYuan(cents),
      percentage:
        expenseCents > 0
          ? Math.round((cents / expenseCents) * 10000) / 100
          : 0,
    };
  }).filter((c) => c.amount > 0);

  const monthlyData = Object.entries(monthlyCents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      income: centsToYuan(data.income),
      expense: centsToYuan(data.expense),
    }));

  return {
    totalIncome: centsToYuan(incomeCents),
    totalExpense: centsToYuan(expenseCents),
    grossProfit: centsToYuan(grossProfitCents),
    grossMargin,
    categoryBreakdown,
    monthlyData,
  };
}
