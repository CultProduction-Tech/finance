import { NextRequest, NextResponse } from "next/server";
import {
  getAccountBalance,
  getBudgets,
  getBudgetDetail,
  getOperationCategories,
  getPaymentStructure,
} from "@/lib/planfact-client";
import { getProjectsCount } from "@/lib/amocrm-client";

export interface ExpenseCategory {
  id: number;
  name: string;
  fact: number;
  budget: number;
}

export interface KpiResponse {
  revenue: number;
  variableExpenses: number;
  margin: number;
  marginPercent: number;
  fixedExpenses: number;
  profit: number;
  cashOnHand: number;
  projectsCount: number;
  monthly: MonthlyKpi[];
  expenseCategories: ExpenseCategory[];
}

export interface MonthlyKpi {
  month: string;
  revenue: number;
  variableExpenses: number;
  margin: number;
  marginPercent: number;
  fixedExpenses: number;
  profit: number;
  factProfit: number;
  budgetProfit: number;
  factRevenue: number;
  factProfitability: number;
  budgetRevenue: number;
  budgetMargin: number;
  budgetMarginPercent: number;
  budgetFixedExpenses: number;
  isPast: boolean;
}

/**
 * GET /api/kpi?startDate=2026-01-01&endDate=2026-12-31
 *
 * Прошедшие/текущий месяц → paymentstructure factValue (точные агрегаты P&L)
 * Будущие месяцы → Бюджет БДР (Бюджет 26)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 },
      );
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Справочник статей + бюджеты БДР + остатки + проекты из AMO
    const [categories, budgets, accountBalance, projectsCount] = await Promise.all([
      getOperationCategories(),
      getBudgets({ budgetMethod: "Bdr" }),
      getAccountBalance(now.toISOString()),
      getProjectsCount(startDate, endDate),
    ]);

    // Корневые статьи
    const incomeRoot = categories.items.find(
      (c) => c.parentOperationCategoryId === null && c.operationCategoryType === "Income",
    );
    const outcomeRoot = categories.items.find(
      (c) => c.parentOperationCategoryId === null && c.operationCategoryType === "Outcome",
    );
    if (!incomeRoot || !outcomeRoot) {
      throw new Error("Cannot find root Income/Outcome categories");
    }

    // Классификация статей
    const categoryClassification = new Map<number, {
      isRevenue: boolean;
      isVariableExpense: boolean;
      isFixedExpense: boolean;
    }>();
    for (const cat of categories.items) {
      categoryClassification.set(cat.operationCategoryId, {
        isRevenue: cat.accountCategoryType === "Income" || cat.accountCategoryType === "IncomeUndistributed",
        isVariableExpense: cat.outcomeClassification === "DirectVariable" || cat.accountCategoryType === "OutcomeUndistributed",
        isFixedExpense: cat.outcomeClassification === "IndirectFixed",
      });
    }

    // Генерируем месяцы
    const months: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const pastMonths = months.filter((m) => m <= currentMonth);
    const futureMonths = months.filter((m) => m > currentMonth);

    // === Прошлые/текущий: paymentstructure (помесячно, параллельно) ===
    const psPromises = pastMonths.map((m) => {
      const [y, mo] = m.split("-").map(Number);
      const mStart = `${y}-${String(mo).padStart(2, "0")}-01`;
      const lastDay = new Date(y, mo, 0).getDate();
      const mEnd = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return getPaymentStructure(
        mStart, mEnd,
        [incomeRoot.operationCategoryId, outcomeRoot.operationCategoryId],
        { isCalculation: true },
      );
    });

    const psResults = await Promise.all(psPromises);

    // Собираем факт: детали для выручки/маржи, корневые итоги для прибыли
    interface MonthlyEntry {
      revenue: number;
      variableExpenses: number;
      fixedExpenses: number;
      profit: number;
      factProfit: number;
      budgetProfit: number;
      factRevenue: number;
      factProfitability: number;
      budgetRevenue: number;
      budgetVariableExpenses: number;
      budgetFixedExpenses: number;
    }
    const emptyEntry = (): MonthlyEntry => ({
      revenue: 0, variableExpenses: 0, fixedExpenses: 0, profit: 0,
      factProfit: 0, budgetProfit: 0, factRevenue: 0, factProfitability: 0,
      budgetRevenue: 0, budgetVariableExpenses: 0, budgetFixedExpenses: 0,
    });
    const monthlyMap = new Map<string, MonthlyEntry>();

    for (let i = 0; i < pastMonths.length; i++) {
      const monthKey = pastMonths[i];
      const ps = psResults[i];

      let revenue = 0;
      let variableExpenses = 0;
      let fixedExpenses = 0;
      let totalIncome = 0;
      let totalOutcome = 0;

      for (const item of ps.items || []) {
        // Корневые итоги → Чистая прибыль = Доходы - Расходы
        if (item.operationCategoryId === incomeRoot.operationCategoryId) {
          totalIncome = item.factValue;
        } else if (item.operationCategoryId === outcomeRoot.operationCategoryId) {
          totalOutcome = item.factValue;
        }

        // Детали → выручка, переменные, постоянные
        for (const detail of item.details || []) {
          const cls = categoryClassification.get(detail.operationCategoryId);
          if (!cls) continue;
          const value = detail.factValue;
          if (cls.isRevenue) revenue += value;
          else if (cls.isVariableExpense) variableExpenses += Math.abs(value);
          else if (cls.isFixedExpense) fixedExpenses += Math.abs(value);
        }
      }

      const factProfit = totalIncome - totalOutcome;
      const entry = monthlyMap.get(monthKey) || emptyEntry();
      entry.revenue = revenue;
      entry.variableExpenses = variableExpenses;
      entry.fixedExpenses = fixedExpenses;
      entry.profit = factProfit;
      entry.factProfit = factProfit;
      entry.factRevenue = totalIncome;
      entry.factProfitability = totalIncome !== 0
        ? (factProfit / totalIncome) * 100
        : 0;
      monthlyMap.set(monthKey, entry);
    }

    // === Бюджет БДР (для всех месяцев — нужен для графика "Бюджет НИ") ===
    const targetBudget = budgets.items.find((b) =>
      b.budgetStatus !== "Closed" && b.startDate <= endDate && b.endDate >= startDate,
    );

    const budgetDetail = targetBudget ? await getBudgetDetail(targetBudget.budgetId) : null;

    if (budgetDetail) {

      for (const version of budgetDetail.versions) {
        for (const item of version.info.items) {
          const monthKey = item.date.substring(0, 7);
          if (!months.includes(monthKey)) continue;

          const cls = categoryClassification.get(item.operationCategoryId);
          const cat = categories.items.find((c) => c.operationCategoryId === item.operationCategoryId);
          if (!cls || !cat) continue;

          if (!monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, emptyEntry());
          }
          const entry = monthlyMap.get(monthKey)!;

          // Бюджетная прибыль: все доходы минус все расходы
          if (cat.operationCategoryType === "Income") entry.budgetProfit += item.value;
          else if (cat.operationCategoryType === "Outcome") entry.budgetProfit -= Math.abs(item.value);

          // Бюджетные значения по показателям (для графика Бизнес-уравнение)
          if (cls.isRevenue) entry.budgetRevenue += item.value;
          else if (cls.isVariableExpense) entry.budgetVariableExpenses += Math.abs(item.value);
          else if (cls.isFixedExpense) entry.budgetFixedExpenses += Math.abs(item.value);

          // Для будущих месяцев — заполняем основные поля из бюджета
          if (futureMonths.includes(monthKey)) {
            if (cat.operationCategoryType === "Income") entry.profit += item.value;
            else if (cat.operationCategoryType === "Outcome") entry.profit -= Math.abs(item.value);

            if (cls.isRevenue) entry.revenue += item.value;
            else if (cls.isVariableExpense) entry.variableExpenses += Math.abs(item.value);
            else if (cls.isFixedExpense) entry.fixedExpenses += Math.abs(item.value);
          }
        }
      }
    }

    // === Итоги ===
    let totalRevenue = 0;
    let totalVariableExpenses = 0;
    let totalFixedExpenses = 0;
    let totalProfit = 0;
    const monthly: MonthlyKpi[] = [];

    for (const monthKey of Array.from(monthlyMap.keys()).sort()) {
      const m = monthlyMap.get(monthKey)!;
      const margin = m.revenue - m.variableExpenses;
      const marginPercent = m.revenue > 0 ? Math.round((margin / m.revenue) * 100) : 0;
      const budgetMargin = m.budgetRevenue - m.budgetVariableExpenses;
      const budgetMarginPercent = m.budgetRevenue > 0 ? Math.round((budgetMargin / m.budgetRevenue) * 100) : 0;

      monthly.push({
        month: monthKey,
        revenue: m.revenue,
        variableExpenses: m.variableExpenses,
        margin,
        marginPercent,
        fixedExpenses: m.fixedExpenses,
        profit: m.profit,
        factProfit: m.factProfit,
        budgetProfit: m.budgetProfit,
        factRevenue: m.factRevenue,
        factProfitability: m.factProfitability,
        budgetRevenue: m.budgetRevenue,
        budgetMargin,
        budgetMarginPercent,
        budgetFixedExpenses: m.budgetFixedExpenses,
        isPast: monthKey <= currentMonth,
      });

      totalRevenue += m.revenue;
      totalVariableExpenses += m.variableExpenses;
      totalFixedExpenses += m.fixedExpenses;
      totalProfit += m.profit;
    }

    const totalMargin = totalRevenue - totalVariableExpenses;
    const totalMarginPercent = totalRevenue > 0
      ? Math.round((totalMargin / totalRevenue) * 100)
      : 0;

    // === Расходы по статьям (для графика "Исполнение бюджета расходов") ===
    // Факт: кумулятивный paymentstructure за прошедший период
    // Бюджет: из budget API по категориям за те же месяцы
    const expenseCategories: ExpenseCategory[] = [];
    if (pastMonths.length > 0) {
      const firstPast = pastMonths[0];
      const lastPast = pastMonths[pastMonths.length - 1];
      const [py, pm] = firstPast.split("-").map(Number);
      const [ly, lm] = lastPast.split("-").map(Number);
      const lastDay = new Date(ly, lm, 0).getDate();
      const cumPs = await getPaymentStructure(
        `${py}-${String(pm).padStart(2, "0")}-01`,
        `${ly}-${String(lm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
        [outcomeRoot.operationCategoryId],
        { isCalculation: true },
      );

      // Собираем бюджет по статьям расходов из budget API за прошедшие месяцы
      // Budget items могут быть на уровне подкатегорий — маппим к parent (первый уровень)
      const parentMap = new Map<number, number>();
      for (const cat of categories.items) {
        if (cat.parentOperationCategoryId !== null) {
          parentMap.set(cat.operationCategoryId, cat.parentOperationCategoryId);
        }
      }
      // Первый уровень под outcome root
      const firstLevelOutcome = new Set(
        categories.items.filter((c) => c.parentOperationCategoryId === outcomeRoot.operationCategoryId).map((c) => c.operationCategoryId),
      );
      function getFirstLevelParent(id: number): number {
        let current = id;
        while (parentMap.has(current) && !firstLevelOutcome.has(current)) {
          current = parentMap.get(current)!;
        }
        return current;
      }

      const budgetByCategory = new Map<number, number>();
      if (budgetDetail) {
        for (const version of budgetDetail.versions) {
          for (const item of version.info.items) {
            const monthKey = item.date.substring(0, 7);
            if (!pastMonths.includes(monthKey)) continue;
            const cat = categories.items.find((c) => c.operationCategoryId === item.operationCategoryId);
            if (!cat || cat.operationCategoryType !== "Outcome") continue;
            const parentId = getFirstLevelParent(item.operationCategoryId);
            budgetByCategory.set(parentId, (budgetByCategory.get(parentId) || 0) + Math.abs(item.value));
          }
        }
      }

      for (const item of cumPs.items || []) {
        for (const detail of item.details || []) {
          const budgetVal = budgetByCategory.get(detail.operationCategoryId) || 0;
          if (Math.abs(detail.factValue) === 0 && budgetVal === 0) continue;
          expenseCategories.push({
            id: detail.operationCategoryId,
            name: detail.operationCategory?.title || `Статья ${detail.operationCategoryId}`,
            fact: Math.abs(detail.factValue),
            budget: budgetVal,
          });
        }
      }
      expenseCategories.sort((a, b) => b.fact - a.fact);
    }

    const response: KpiResponse = {
      revenue: totalRevenue,
      variableExpenses: totalVariableExpenses,
      margin: totalMargin,
      marginPercent: totalMarginPercent,
      fixedExpenses: totalFixedExpenses,
      profit: totalProfit,
      cashOnHand: accountBalance.total,
      projectsCount,
      monthly,
      expenseCategories,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("KPI API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
