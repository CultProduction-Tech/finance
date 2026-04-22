import { NextRequest, NextResponse } from "next/server";
import { getEntityConfig } from "@/lib/entity-config";
import type { PaymentStructureResponse } from "@/lib/planfact-client";
import { getProjectDetails, getLeadCountsByCreatedDate } from "@/lib/amocrm-client";
import type { AmoProjectDetail } from "@/lib/amocrm-client";
import type { LegalEntity } from "@/types/finance";


const REQUESTS_PLAN_2026 = [7, 19, 22, 11, 14, 20, 20, 30, 30, 32, 16, 0];
const PROJECTS_PLAN = 10;

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
  cashflow3Months: number;
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
  fixedExpensesForEquation: number;
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
  projects?: { id: number; name: string; price: number; expensePlan: number; marginPercent: number }[];
  requestsFact: number;
  requestsPlan: number;
  projectsSoldFact: number;
  projectsNotSoldFact: number;
  projectsSoldRevenue: number;
  projectsPlan: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const entity = (searchParams.get("entity") || "blaster") as LegalEntity;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 },
      );
    }

    const config = getEntityConfig(entity);
    const pf = config.planfact;
    const amoConfig = config.amo;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Прогноз кэшфлоу: 3 месяца вперёд от первого числа текущего месяца
    const cfStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const cfEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    const cfStartStr = `${cfStart.getFullYear()}-${String(cfStart.getMonth() + 1).padStart(2, "0")}-01`;
    const cfEndStr = `${cfEnd.getFullYear()}-${String(cfEnd.getMonth() + 1).padStart(2, "0")}-${String(cfEnd.getDate()).padStart(2, "0")}`;

    const [categories, budgets, accountBalance, allProjects, cashFlow] = await Promise.all([
      pf.getOperationCategories(),
      pf.getBudgets({ budgetMethod: "Bdr" }),
      pf.getAccountBalance(now.toISOString()),
      config.excludeProjectIds?.length ? pf.getProjects() : Promise.resolve(null),
      pf.getCashFlow(cfStartStr, cfEndStr, { standardPeriod: "Month" }).catch((e) => {
        console.warn("CashFlow fetch failed:", e);
        return null;
      }),
    ]);

    const pfProjectIds = allProjects
      ? allProjects.items
          .filter((p) => !config.excludeProjectIds!.includes(p.projectId))
          .map((p) => p.projectId)
      : undefined;

    const incomeRoot = categories.items.find(
      (c) => c.parentOperationCategoryId === null && c.operationCategoryType === "Income",
    );
    const outcomeRoot = categories.items.find(
      (c) => c.parentOperationCategoryId === null && c.operationCategoryType === "Outcome",
    );
    if (!incomeRoot || !outcomeRoot) {
      throw new Error("Cannot find root Income/Outcome categories");
    }

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

    const monthRanges = months.map((m) => {
      const [y, mo] = m.split("-").map(Number);
      const mStart = `${y}-${String(mo).padStart(2, "0")}-01`;
      const lastDay = new Date(y, mo, 0).getDate();
      const mEnd = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return { m, mStart, mEnd };
    });

    const projectPromises = monthRanges.map(({ m, mStart, mEnd }) => {
      if (m > currentMonth) return Promise.resolve([]);
      return getProjectDetails(mStart, mEnd, amoConfig);
    });

    const leadCountPromises = monthRanges.map(({ m, mStart, mEnd }) => {
      if (m > currentMonth) return Promise.resolve({ sold: 0, notSold: 0, soldTotalPrice: 0, totalRequests: 0 });
      return getLeadCountsByCreatedDate(mStart, mEnd, amoConfig);
    });

    const [projectResults, leadCountResults] = await Promise.all([
      Promise.all(projectPromises),
      Promise.all(leadCountPromises),
    ]);

    const projectsByMonth = new Map<string, AmoProjectDetail[]>();
    const leadCountsByMonth = new Map<string, { sold: number; notSold: number; soldTotalPrice: number; totalRequests: number }>();
    for (let i = 0; i < months.length; i++) {
      projectsByMonth.set(months[i], projectResults[i]);
      leadCountsByMonth.set(months[i], leadCountResults[i]);
    }

    const psPromises = pastMonths.map((m) => {
      const [y, mo] = m.split("-").map(Number);
      const mStart = `${y}-${String(mo).padStart(2, "0")}-01`;
      const lastDay = new Date(y, mo, 0).getDate();
      const mEnd = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return pf.getPaymentStructure(
        mStart, mEnd,
        [incomeRoot.operationCategoryId, outcomeRoot.operationCategoryId],
        { isCalculation: true, projectIds: pfProjectIds },
      );
    });

    const psResults = await Promise.all(psPromises);

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
        if (item.operationCategoryId === incomeRoot.operationCategoryId) {
          totalIncome = item.factValue;
        } else if (item.operationCategoryId === outcomeRoot.operationCategoryId) {
          totalOutcome = item.factValue;
        }

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

    const targetBudget = budgets.items.find((b) =>
      b.budgetStatus !== "Closed" && b.startDate <= endDate && b.endDate >= startDate,
    );

    const budgetDetail = targetBudget ? await pf.getBudgetDetail(targetBudget.budgetId) : null;

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

          if (cat.operationCategoryType === "Income") entry.budgetProfit += item.value;
          else if (cat.operationCategoryType === "Outcome") entry.budgetProfit -= Math.abs(item.value);

          if (cls.isRevenue) entry.budgetRevenue += item.value;
          else if (cls.isVariableExpense) entry.budgetVariableExpenses += Math.abs(item.value);
          else if (cls.isFixedExpense) entry.budgetFixedExpenses += Math.abs(item.value);

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

      const fixedExpensesForEquation = monthKey === currentMonth ? m.budgetFixedExpenses : m.fixedExpenses;

      monthly.push({
        month: monthKey,
        revenue: m.revenue,
        variableExpenses: m.variableExpenses,
        margin,
        marginPercent,
        fixedExpenses: m.fixedExpenses,
        fixedExpensesForEquation,
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
        projects: projectsByMonth.get(monthKey)?.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          expensePlan: p.expensePlan,
          marginPercent: p.marginPercent,
        })),
        requestsFact: leadCountsByMonth.get(monthKey)?.totalRequests ?? 0,
        requestsPlan: REQUESTS_PLAN_2026[parseInt(monthKey.split("-")[1], 10) - 1] ?? 0,
        projectsSoldFact: leadCountsByMonth.get(monthKey)?.sold ?? 0,
        projectsNotSoldFact: leadCountsByMonth.get(monthKey)?.notSold ?? 0,
        projectsSoldRevenue: leadCountsByMonth.get(monthKey)?.soldTotalPrice ?? 0,
        projectsPlan: PROJECTS_PLAN,
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

    const expenseCategories: ExpenseCategory[] = [];
    const completedPastMonths = pastMonths.filter((m) => m < currentMonth);
    const hasCurrentInPeriod = months.includes(currentMonth);
    if (completedPastMonths.length > 0 || hasCurrentInPeriod) {
      let cumPs: PaymentStructureResponse = { items: [] };
      if (completedPastMonths.length > 0) {
        const firstPast = completedPastMonths[0];
        const lastPast = completedPastMonths[completedPastMonths.length - 1];
        const [py, pm] = firstPast.split("-").map(Number);
        const [ly, lm] = lastPast.split("-").map(Number);
        const lastDay = new Date(ly, lm, 0).getDate();
        cumPs = await pf.getPaymentStructure(
          `${py}-${String(pm).padStart(2, "0")}-01`,
          `${ly}-${String(lm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
          [outcomeRoot.operationCategoryId],
          { isCalculation: true, projectIds: pfProjectIds },
        );
      }

      const parentMap = new Map<number, number>();
      for (const cat of categories.items) {
        if (cat.parentOperationCategoryId !== null) {
          parentMap.set(cat.operationCategoryId, cat.parentOperationCategoryId);
        }
      }
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
      const currentMonthBudgetByCategory = new Map<number, number>();
      const currentMonthIncluded = months.includes(currentMonth);
      if (budgetDetail) {
        for (const version of budgetDetail.versions) {
          for (const item of version.info.items) {
            const monthKey = item.date.substring(0, 7);
            if (!months.includes(monthKey)) continue;
            const cat = categories.items.find((c) => c.operationCategoryId === item.operationCategoryId);
            if (!cat || cat.operationCategoryType !== "Outcome") continue;
            const parentId = getFirstLevelParent(item.operationCategoryId);
            budgetByCategory.set(parentId, (budgetByCategory.get(parentId) || 0) + Math.abs(item.value));
            if (monthKey === currentMonth) {
              currentMonthBudgetByCategory.set(parentId, (currentMonthBudgetByCategory.get(parentId) || 0) + Math.abs(item.value));
            }
          }
        }
      }

      const factByDetail = new Map<number, { name: string; value: number }>();
      for (const item of cumPs.items || []) {
        for (const detail of item.details || []) {
          factByDetail.set(detail.operationCategoryId, {
            name: detail.operationCategory?.title || `Статья ${detail.operationCategoryId}`,
            value: Math.abs(detail.factValue),
          });
        }
      }

      const addedIds = new Set<number>();
      for (const [id, data] of factByDetail) {
        const budgetVal = budgetByCategory.get(id) || 0;
        const currentBudget = currentMonthIncluded ? (currentMonthBudgetByCategory.get(id) || 0) : 0;
        const factWithCurrent = data.value + currentBudget;
        if (factWithCurrent === 0 && budgetVal === 0) continue;
        expenseCategories.push({
          id,
          name: data.name,
          fact: factWithCurrent,
          budget: budgetVal,
        });
        addedIds.add(id);
      }
      if (currentMonthIncluded) {
        for (const [id, budgetCur] of currentMonthBudgetByCategory) {
          if (addedIds.has(id)) continue;
          const budgetVal = budgetByCategory.get(id) || 0;
          const cat = categories.items.find((c) => c.operationCategoryId === id);
          if (budgetCur === 0 && budgetVal === 0) continue;
          expenseCategories.push({
            id,
            name: cat?.title || `Статья ${id}`,
            fact: budgetCur,
            budget: budgetVal,
          });
        }
      }
      expenseCategories.sort((a, b) => b.fact - a.fact);
    }

    if (pastMonths.length === 0 && budgetDetail) {
      const parentMap = new Map<number, number>();
      for (const cat of categories.items) {
        if (cat.parentOperationCategoryId !== null) {
          parentMap.set(cat.operationCategoryId, cat.parentOperationCategoryId);
        }
      }
      const firstLevelOutcome = new Set(
        categories.items.filter((c) => c.parentOperationCategoryId === outcomeRoot.operationCategoryId).map((c) => c.operationCategoryId),
      );
      function getFirstLevelParentFallback(id: number): number {
        let current = id;
        while (parentMap.has(current) && !firstLevelOutcome.has(current)) {
          current = parentMap.get(current)!;
        }
        return current;
      }

      const budgetByCategory = new Map<number, { name: string; value: number }>();
      for (const version of budgetDetail.versions) {
        for (const item of version.info.items) {
          const monthKey = item.date.substring(0, 7);
          if (!months.includes(monthKey)) continue;
          const cat = categories.items.find((c) => c.operationCategoryId === item.operationCategoryId);
          if (!cat || cat.operationCategoryType !== "Outcome") continue;
          const parentId = getFirstLevelParentFallback(item.operationCategoryId);
          const parentCat = categories.items.find((c) => c.operationCategoryId === parentId);
          const existing = budgetByCategory.get(parentId) || { name: parentCat?.title || `Статья ${parentId}`, value: 0 };
          existing.value += Math.abs(item.value);
          budgetByCategory.set(parentId, existing);
        }
      }

      for (const [id, data] of budgetByCategory) {
        if (data.value === 0) continue;
        expenseCategories.push({
          id,
          name: data.name,
          fact: data.value,
          budget: data.value,
        });
      }
      expenseCategories.sort((a, b) => b.fact - a.fact);
    }

    const cashflow3Months = cashFlow?.planDifference ?? 0;

    const response: KpiResponse = {
      revenue: totalRevenue,
      variableExpenses: totalVariableExpenses,
      margin: totalMargin,
      marginPercent: totalMarginPercent,
      fixedExpenses: totalFixedExpenses,
      profit: totalProfit,
      cashOnHand: accountBalance.total,
      cashflow3Months,
      projectsCount: Array.from(projectsByMonth.values()).reduce((sum, p) => sum + p.length, 0),
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
