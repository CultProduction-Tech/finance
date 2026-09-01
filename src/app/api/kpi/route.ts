import { NextRequest, NextResponse } from "next/server";
import { getEntityConfig } from "@/lib/entity-config";
import type { PaymentStructureResponse } from "@/lib/planfact-client";
import { getProjectDetails, getLeadCountsByCreatedDate, getBlasterCountsByBriefField, getCultCountsByBriefField } from "@/lib/amocrm-client";
import type { AmoProjectDetail, BlasterBriefResult, CultBriefResult } from "@/lib/amocrm-client";
import type { LegalEntity, BudgetMeta } from "@/types/finance";
import { saveSnapshot, readSnapshot } from "@/lib/snapshot";
import { currentMonthInBusinessTz, BUSINESS_TZ } from "@/lib/timezone";
import { BLASTER_PLANS, CULT_PLANS, PLANS_YEAR } from "@/lib/plans";
import { getPlanFactFreezeState, isSnapshotBeforeFreeze } from "@/lib/planfact-freeze";
import { mergeKpiPlanFactFromSnapshot } from "@/lib/merge-kpi-planfact-freeze";

export interface ExpenseCategory {
  id: number;
  name: string;
  fact: number;
  budget: number;
}

export interface KpiResponse {
  revenue: number;
  /** Выручка в том же факт/бюджет-базисе, что и бары «Бюджета расходов»
   *  (прошедшие месяцы — факт, текущий и будущие — бюджет). Знаменатель для
   *  «% от выручки»: иначе полный бюджет расходов делился бы на факт-к-дате
   *  текущего месяца → скачки 501%/91% вместо честных ~31%. */
  expenseBaseRevenue: number;
  variableExpenses: number;
  margin: number;
  marginPercent: number;
  fixedExpenses: number;
  profit: number;
  projectsCount: number;
  monthly: MonthlyKpi[];
  expenseCategories: ExpenseCategory[];
  budgetLabel: string;
  /** Паспорт плана: из каких бюджетов собран + есть ли в PlanFact версия новее */
  budgetMeta?: BudgetMeta;
  /** ISO-время расчёта данных (для live) или создания снимка (для snapshot=1) */
  syncedAt?: string;
  /** true — ответ отдан из файлового снапшота, а не рассчитан сейчас */
  snapshot?: boolean;
  /** Статус источников: "ok" | текст ошибки. amoCRM деградирует частично (воронка нулевая), PlanFact — фатален. budget — сконфигурированный бюджет не найден (план нулевой). */
  sources?: { planfact: string; amocrm: string; budget?: string };
  /** Култ: сделки периода (по дате создания) с пустой «Датой акта» — невидимы в графике маржинальности */
  projectsWithoutAct?: { id: number; name: string }[];
  /** Бластер: сделки периода в «запросных» статусах без «Бриф получен» — невидимы в Запросах/Победах */
  projectsWithoutBrief?: { id: number; name: string }[];
  /** Платёжный день: денежный слой PlanFact заморожен на снимке до окна */
  planFactFrozen?: boolean;
  /** Подпись «на когда» заморозки ПФ, напр. «вт 26.08 23:59» */
  planFactAsOf?: string;
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
  budgetRevenue: number;
  budgetMargin: number;
  budgetMarginPercent: number;
  budgetFixedExpenses: number;
  isPast: boolean;
  projects?: { id: number; name: string; price: number; expensePlan: number; marginPercent: number }[];
  marginalityProjects?: { id: number; name: string; price: number; expensePlan: number; marginPercent: number }[];
  requestsFact: number;
  requestsPlan: number;
  projectsSoldFact: number;
  projectsPlan: number;
  winsFact: number;
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

    // Мгновенный ответ из файлового снимка — ноль внешних запросов.
    // Фронт сначала просит снапшот, параллельно тянет live и подменяет.
    const snapshotKey = `kpi-${entity}-${startDate}-${endDate}`;
    if (searchParams.get("snapshot") === "1") {
      const snap = await readSnapshot<KpiResponse>(snapshotKey);
      if (!snap) {
        return NextResponse.json({ error: "no snapshot yet" }, { status: 404 });
      }
      return NextResponse.json({ ...snap.payload, syncedAt: snap.snapshotAt, snapshot: true });
    }

    const config = getEntityConfig(entity);
    const pf = config.planfact;
    const amoConfig = config.amo;

    const currentMonth = currentMonthInBusinessTz();

    // Баланс счетов здесь не запрашиваем: карточка «На счетах» скрыта из UI,
    // а остатки для графика cashflow берёт /api/cashflow сам.
    const [categories, budgets, allProjects] = await Promise.all([
      pf.getOperationCategories(),
      pf.getBudgets({ budgetMethod: "Bdr" }),
      config.excludeProjectIds?.length ? pf.getProjects() : Promise.resolve(null),
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
      // Переменная и постоянная — взаимоисключимы явно (не порядком else if ниже).
      // При конфликте тегов PlanFact приоритет у переменной + fail-loud в лог, чтобы
      // статья не «пряталась» молча в одну из корзин по счастливому порядку проверок.
      const isVariable = cat.outcomeClassification === "DirectVariable" || cat.accountCategoryType === "OutcomeUndistributed";
      const isFixed = cat.outcomeClassification === "IndirectFixed";
      if (isVariable && isFixed) {
        console.warn(`PlanFact: категория ${cat.operationCategoryId} размечена и как переменная, и как постоянная — считаем переменной`);
      }
      categoryClassification.set(cat.operationCategoryId, {
        isRevenue: cat.accountCategoryType === "Income" || cat.accountCategoryType === "IncomeUndistributed",
        isVariableExpense: isVariable,
        isFixedExpense: isFixed && !isVariable,
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

    const isCult = entity === "cult";

    // Бластер: проекты — по «Дате акта». Культ: для подсчёта количества — по created_at.
    const projectsDateMode: "act" | "created" = isCult ? "created" : "act";
    const projectPromises = monthRanges.map(({ m, mStart, mEnd }) => {
      if (m > currentMonth) return Promise.resolve([]);
      return getProjectDetails(mStart, mEnd, amoConfig, projectsDateMode);
    });

    // Культ: проекты для графика маржинальности бакетим по «Дате акта» (реализация
    // проекта), а не по created_at как счётчик «Проекты» — маржа признаётся при сдаче,
    // как у Бластера. Отдельный фетч, т.к. анкер-дата другая (акт может быть в другом
    // месяце, чем создание, и ловит переходящие проекты: создан в пред. году, сдан в этом).
    const marginalityProjectsPromises = isCult
      ? monthRanges.map(({ m, mStart, mEnd }) => {
          if (m > currentMonth) return Promise.resolve([]);
          return getProjectDetails(mStart, mEnd, amoConfig, "act");
        })
      : null;

    const leadCountPromises = monthRanges.map(({ m, mStart, mEnd }) => {
      if (m > currentMonth) return Promise.resolve({ sold: 0, totalRequests: 0, wins: 0 });
      return getLeadCountsByCreatedDate(mStart, mEnd, amoConfig);
    });

    // Культ: один запрос — лиды в 8 статусах, месяц = «Бриф получен».
    const cultCountsPromise: Promise<CultBriefResult | null> = isCult
      ? getCultCountsByBriefField(amoConfig)
      : Promise.resolve(null);

    // Бластер: один запрос в AmoCRM — лиды в 6 статусах с custom-полем "Бриф получен".
    //   Запросы/Победы/Завершённые в Апр+ — бакет по дате из поля.
    //   Янв-Мар — старая логика по дате создания лида (из getLeadCountsByCreatedDate),
    //   чтобы избежать аномалии с массовой чисткой в Мар 2026.
    const blasterCountsPromise: Promise<BlasterBriefResult | null> = !isCult
      ? getBlasterCountsByBriefField(amoConfig)
      : Promise.resolve(null);

    // Бластер: сделки [Продажа/Реализовано] без «Даты акта» — для подсветки бейджем.
    // Основной набор Бластера идёт по акту и такие сделки уже отсёк (continue), поэтому
    // нужен отдельный проход по created_at (как у Култа счётчик «Проекты»): он видит все
    // сделки периода с флагом hasActDate. Один запрос на загрузку. Люди забывают акт —
    // без подсветки сделка тихо выпадает из «Проектов по актам» и маржинальности.
    const blasterActCheckPromise: Promise<AmoProjectDetail[] | null> = !isCult
      ? getProjectDetails(startDate, endDate, amoConfig, "created")
      : Promise.resolve(null);

    // amoCRM — частичная деградация: при падении воронка обнуляется, но дашборд живёт,
    // а в ответе появляется sources.amocrm с текстом ошибки (fail loud в UI, не тихие нули).
    let amocrmStatus = "ok";
    let projectResults: AmoProjectDetail[][] = months.map(() => []);
    let marginalityProjectResults: AmoProjectDetail[][] | null = null;
    let leadCountResults: { sold: number; totalRequests: number; wins: number }[] = months.map(() => ({ sold: 0, totalRequests: 0, wins: 0 }));
    let blasterCounts: BlasterBriefResult | null = null;
    let cultCounts: CultBriefResult | null = null;
    let blasterActCheck: AmoProjectDetail[] | null = null;
    try {
      [projectResults, marginalityProjectResults, leadCountResults, blasterCounts, cultCounts, blasterActCheck] = await Promise.all([
        Promise.all(projectPromises),
        marginalityProjectsPromises ? Promise.all(marginalityProjectsPromises) : Promise.resolve(null),
        Promise.all(leadCountPromises),
        blasterCountsPromise,
        cultCountsPromise,
        blasterActCheckPromise,
      ]);
    } catch (amoError) {
      amocrmStatus = amoError instanceof Error ? amoError.message : String(amoError);
      console.error("amoCRM недоступен, воронка обнулена:", amocrmStatus);
    }

    const projectsByMonth = new Map<string, AmoProjectDetail[]>();
    const marginalityProjectsByMonth = new Map<string, AmoProjectDetail[]>();
    const leadCountsByMonth = new Map<string, { sold: number; totalRequests: number; wins: number }>();
    const cultCountsByMonth: Record<string, { requests: number; takenToWork: number }> = cultCounts?.buckets ?? {};
    const blasterCountsByMonth: Record<string, { requests: number; wins: number; completed: number }> = blasterCounts?.buckets ?? {};
    for (let i = 0; i < months.length; i++) {
      projectsByMonth.set(months[i], projectResults[i]);
      leadCountsByMonth.set(months[i], leadCountResults[i]);
      if (marginalityProjectResults) {
        marginalityProjectsByMonth.set(months[i], marginalityProjectResults[i]);
      }
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
      budgetRevenue: number;
      budgetVariableExpenses: number;
      budgetFixedExpenses: number;
    }
    const emptyEntry = (): MonthlyEntry => ({
      revenue: 0, variableExpenses: 0, fixedExpenses: 0, profit: 0,
      factProfit: 0, budgetProfit: 0, factRevenue: 0,
      budgetRevenue: 0, budgetVariableExpenses: 0, budgetFixedExpenses: 0,
    });
    const monthlyMap = new Map<string, MonthlyEntry>();

    for (let i = 0; i < pastMonths.length; i++) {
      const monthKey = pastMonths[i];
      const ps = psResults[i];
      // Текущий месяц: в «факт» кладём planValue из ОПиУ ПФ («по плану» на весь месяц),
      // не накопленный factValue к дате — как синяя цифра в отчёте ПФ при «показывать план».
      // Закрытые месяцы — обычный факт. Это НЕ версия бюджета из /budgets (там другие цифры).
      const usePfPlan = monthKey === currentMonth;

      let revenue = 0;
      let variableExpenses = 0;
      let fixedExpenses = 0;
      let totalIncome = 0;
      let totalOutcome = 0;

      for (const item of ps.items || []) {
        if (item.operationCategoryId === incomeRoot.operationCategoryId) {
          totalIncome = usePfPlan ? item.planValue : item.factValue;
        } else if (item.operationCategoryId === outcomeRoot.operationCategoryId) {
          totalOutcome = usePfPlan ? item.planValue : item.factValue;
        }

        for (const detail of item.details || []) {
          const cls = categoryClassification.get(detail.operationCategoryId);
          if (!cls) continue;
          const value = usePfPlan ? detail.planValue : detail.factValue;
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
      monthlyMap.set(monthKey, entry);
    }

    // Выбираем два целевых бюджета по имени (PlanFact иногда хранит имя с пробелом по краям) и склеиваем элементы по месяцу:
    //   месяцы < cutoffMonth -> старый бюджет; месяцы >= cutoffMonth -> новый.
    const cutoffMonth = config.budgets.cutoffMonth; // "YYYY-MM"
    const alive = budgets.items.filter((b) => b.budgetStatus !== "Closed");
    const findByName = (n: string) => alive.find((b) => (b.title?.trim() ?? "") === n.trim());

    // Семейство версий = то же базовое имя без числового префикса («03 Бюджет 2026» → «Бюджет 2026»).
    // Только так проектные бюджеты («Бюджет СнупДок», «Техно Тигры») не принимаются за родню.
    const familyBase = (n: string) => n.trim().replace(/^\d+\s*/, "");
    /** Номер версии из префикса имени — команда нумерует версии сама («03 Бюджет 26» → 3) */
    const versionNum = (n: string) => parseInt(n.trim().match(/^(\d+)/)?.[1] ?? "0", 10);

    // Ищем по имени, а если имя не сошлось — по budgetId. Имя правят руками, id не меняется:
    // без этого запасного пути переименование бюджета обнуляло план (та же авария, что
    // случилась с Култом, только по другой причине). Нашли по id → значит переименовали.
    // Обратный случай: имя сошлось, а id — нет. Значит бюджет завели ЗАНОВО под прежним
    // именем (Култ, 04.08.2026: новый «03 Бюджет 2026», старый переименован в «03.0 …
    // -первая версия»). Цифры при этом верные — читаем то, что так названо, — поэтому
    // не деградация, а предупреждение: закреплённый id указывает на прошлую версию и
    // при следующем переименовании запасной путь молча вернул бы её.
    type Resolved = {
      budget: typeof alive[number] | undefined;
      renamedFrom: string | null;
      reusedName: { name: string; pinnedTitle: string | null } | null;
    };

    const resolveBudget = (v: { name: string; id?: string }): Resolved => {
      const byName = findByName(v.name);
      if (byName) {
        const idDrifted = !!v.id && byName.budgetId !== v.id;
        const pinned = idDrifted ? alive.find((b) => b.budgetId === v.id) : undefined;
        return {
          budget: byName,
          renamedFrom: null,
          reusedName: idDrifted ? { name: v.name, pinnedTitle: pinned?.title?.trim() ?? null } : null,
        };
      }
      const byId = v.id ? alive.find((b) => b.budgetId === v.id) : undefined;
      if (byId) return { budget: byId, renamedFrom: v.name, reusedName: null };
      return { budget: undefined, renamedFrom: null, reusedName: null };
    };

    const oldResolved = resolveBudget(config.budgets.old);
    const newResolved = resolveBudget(config.budgets.new);
    const oldBudget = oldResolved.budget;
    const newBudget = newResolved.budget;

    // fail loud: сконфигурированный бюджет пропал из PlanFact (переименовали/
    // закрыли) — раньше плановые колонки молча обнулялись. Ругаемся только на
    // бюджет, реально нужный запрошенному периоду (old до cutoff, new после).
    const missingBudgets: string[] = [];
    if (months.some((m) => m < cutoffMonth) && !oldBudget) missingBudgets.push(config.budgets.old.name);
    if (months.some((m) => m >= cutoffMonth) && !newBudget) missingBudgets.push(config.budgets.new.name);
    // Кандидаты на замену — живая родня пропавшего бюджета, свежие сверху. Список едет
    // ВНУТРИ текста ошибки намеренно: при пропавшем бюджете живой ответ считается
    // деградированным и отбрасывается в пользу снимка, наружу доходит только sources.budget.
    const MAX_CANDIDATES = 4;
    const oneLine = (s?: string | null) => (s ?? "").replace(/\s*\n+\s*/g, " · ").trim();
    const candidates = missingBudgets.length
      ? alive
          .filter((b) => missingBudgets.some((n) => familyBase(b.title?.trim() ?? "") === familyBase(n)))
          .sort((a, z) =>
            versionNum(z.title?.trim() ?? "") - versionNum(a.title?.trim() ?? "")
            || (z.createDate ?? "").localeCompare(a.createDate ?? ""),
          )
          .slice(0, MAX_CANDIDATES)
      : [];

    let budgetStatus: string | undefined;
    if (missingBudgets.length) {
      budgetStatus = `Бюджет не найден в PlanFact: «${missingBudgets.join("», «")}» — план показан нулями.`;
      if (candidates.length) {
        const lines = candidates.map((b) => {
          const note = oneLine(b.description);
          return `• «${b.title?.trim()}»${note ? ` — ${note}` : ""}`;
        });
        budgetStatus += `\nПохожие бюджеты в PlanFact — вероятно, нужен один из них:\n${lines.join("\n")}`;
      } else {
        budgetStatus += "\nПохожих бюджетов в PlanFact не нашлось — проверь, не закрыт ли он.";
      }
      console.error(`KPI (${entity}):`, budgetStatus.replace(/\n/g, " "));
    }

    // Переименование не ломает цифры, но молчать о нём нельзя: конфиг разошёлся с PlanFact
    // и следующий, кто полезет искать бюджет по имени, его не найдёт.
    const renamedBudgets = [oldResolved, newResolved]
      .filter((r) => r.renamedFrom && r.budget)
      .map((r) => ({ was: r.renamedFrom!, now: r.budget!.title?.trim() ?? "" }));
    if (renamedBudgets.length) {
      console.warn(`KPI (${entity}): бюджет переименован в PlanFact:`,
        renamedBudgets.map((r) => `«${r.was}» → «${r.now}»`).join(", "));
    }

    // Имя переехало на другую запись: цифры верные, но id в конфиге отстал на версию.
    const reusedNames = [oldResolved, newResolved]
      .map((r) => r.reusedName)
      .filter((r): r is NonNullable<typeof r> => !!r);
    if (reusedNames.length) {
      console.warn(`KPI (${entity}): имя бюджета переехало на другую запись PlanFact:`,
        reusedNames.map((r) => `«${r.name}» (id в настройках → ${r.pinnedTitle ? `«${r.pinnedTitle}»` : "запись удалена"})`).join(", "));
    }

    const [oldBudgetDetail, newBudgetDetail] = await Promise.all([
      oldBudget ? pf.getBudgetDetail(oldBudget.budgetId) : Promise.resolve(null),
      newBudget ? pf.getBudgetDetail(newBudget.budgetId) : Promise.resolve(null),
    ]);

    type BudgetDetailResp = NonNullable<typeof oldBudgetDetail>;
    type BudgetVer = BudgetDetailResp["versions"][number];
    const mergedVersions: BudgetVer[] = [];
    if (oldBudgetDetail) {
      for (const v of oldBudgetDetail.versions) {
        const items = v.info.items.filter((i) => i.date.substring(0, 7) < cutoffMonth);
        if (items.length) mergedVersions.push({ ...v, info: { ...v.info, items } });
      }
    }
    if (newBudgetDetail) {
      for (const v of newBudgetDetail.versions) {
        const items = v.info.items.filter((i) => i.date.substring(0, 7) >= cutoffMonth);
        if (items.length) mergedVersions.push({ ...v, info: { ...v.info, items } });
      }
    }
    const sourceDetail = oldBudgetDetail ?? newBudgetDetail;
    const budgetDetail: BudgetDetailResp | null = sourceDetail && mergedVersions.length > 0
      ? { ...sourceDetail, versions: mergedVersions }
      : null;

    // Лейбл для шапки выбираем по концу выбранного периода: если он попадает в "новую" зону — показываем новый.
    // Текст — ДОСЛОВНО название бюджета из PlanFact (b.title), не рукописная подпись:
    // на дашборде видно ровно ту версию, что реально выбрана в источнике. Бюджет не
    // найден → показываем сконфигурированное имя (рядом уже горит красный бейдж).
    const useNewBudget = endDate >= `${cutoffMonth}-01`;
    const activeBudget = useNewBudget ? newBudget : oldBudget;
    const budgetLabel = activeBudget?.title?.trim()
      || (useNewBudget ? config.budgets.new.name : config.budgets.old.name);

    // ── Паспорт плана ───────────────────────────────────────────────────────────
    // Из чего собран план за период и не появился ли в PlanFact бюджет новее того,
    // что зашит в конфиге. Имя бюджета задано строкой, поэтому новая утверждённая
    // версия иначе проходит незамеченной (21.07 её заметил Костя, а не дашборд).
    const oldPartMonths = months.filter((m) => m < cutoffMonth);
    const newPartMonths = months.filter((m) => m >= cutoffMonth);
    const budgetParts = [
      { budget: oldBudget, ms: oldPartMonths },
      { budget: newBudget, ms: newPartMonths },
    ]
      .filter((p) => p.budget && p.ms.length > 0)
      .map((p) => ({
        title: p.budget!.title?.trim() ?? "",
        description: p.budget!.description ?? null,
        from: p.ms[0],
        to: p.ms[p.ms.length - 1],
      }));

    // Баз для сравнения родни две — из конфига и из живого title: если бюджет
    // переименовали, одна из них всё равно сойдётся.
    // Сторож сравнивает с ТЕКУЩИМ бюджетом (config.budgets.new), а не с активным для периода:
    // вопрос «появилась ли версия новее» не зависит от того, какие месяцы выбраны. Иначе на
    // периоде до cutoff (там активен старый бюджет) сторож ругался бы на штатную ситуацию.
    const refTitle = newBudget?.title?.trim() || config.budgets.new.name;
    const refBases = new Set([familyBase(config.budgets.new.name), familyBase(refTitle)]);
    const refVersion = versionNum(refTitle);
    const refCreated = newBudget?.createDate ?? "";

    const newerBudget = alive
      .filter((b) => {
        const title = b.title?.trim() ?? "";
        if (b.budgetId === newBudget?.budgetId) return false;
        if (!refBases.has(familyBase(title))) return false;
        // Новее — либо по номеру версии (переименование «02»→«04» дату создания не меняет),
        // либо по дате создания (новая запись с тем же или меньшим номером).
        return versionNum(title) > refVersion || (b.createDate ?? "") > refCreated;
      })
      .sort((a, b) =>
        versionNum(b.title?.trim() ?? "") - versionNum(a.title?.trim() ?? "")
        || (b.createDate ?? "").localeCompare(a.createDate ?? ""),
      )[0];

    const budgetMeta: BudgetMeta = {
      parts: budgetParts,
      newer: newerBudget
        ? { title: newerBudget.title?.trim() ?? "", description: newerBudget.description ?? null }
        : null,
      renamed: renamedBudgets.length ? renamedBudgets : null,
      reused: reusedNames.length ? reusedNames : null,
    };

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

      const fixedExpensesForEquation = m.fixedExpenses;

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
        marginalityProjects: marginalityProjectsByMonth.get(monthKey)?.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          expensePlan: p.expensePlan,
          marginPercent: p.marginPercent,
        })),
        // Бластер:
        //   Запросы (все месяцы): по полю "Бриф получен" из AmoCRM
        //   Победы/Завершённые: до марта 2026 — по дате создания + текущий статус (избегаем аномалии Мар),
        //                       с апреля 2026 — по дате "Бриф получен" + текущий статус (то же поле что Запросы).
        // Культ: Запросы и Конверсия (числитель) — по «Бриф получен», 8 статусов.
        requestsFact: isCult
          ? (cultCountsByMonth[monthKey]?.requests ?? 0)
          : (blasterCountsByMonth[monthKey]?.requests ?? 0),
        // Количественные планы заданы на PLANS_YEAR — для других лет 0 («плана нет»)
        requestsPlan: !monthKey.startsWith(`${PLANS_YEAR}-`)
          ? 0
          : isCult
            ? CULT_PLANS.requestsPerMonth
            : (BLASTER_PLANS.requestsByMonth2026[parseInt(monthKey.split("-")[1], 10) - 1] ?? 0),
        projectsSoldFact: isCult
          ? (cultCountsByMonth[monthKey]?.takenToWork ?? 0)
          : (monthKey >= "2026-04"
              ? (blasterCountsByMonth[monthKey]?.completed ?? 0)
              : (leadCountsByMonth.get(monthKey)?.sold ?? 0)),
        projectsPlan: !monthKey.startsWith(`${PLANS_YEAR}-`)
          ? 0
          : isCult
            ? CULT_PLANS.projectsPerMonth
            : (BLASTER_PLANS.projectsByMonth2026[parseInt(monthKey.split("-")[1], 10) - 1] ?? 0),
        winsFact: isCult
          ? 0
          : (monthKey >= "2026-04"
              ? (blasterCountsByMonth[monthKey]?.wins ?? 0)
              : (leadCountsByMonth.get(monthKey)?.wins ?? 0)),
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
      // Бюджет текущего И будущих месяцев периода — добавляется в факт-бар
      // (семантика подсказки: «расходы прошедших месяцев + бюджет на текущий и будущие»).
      // Раньше добавлялся только текущий месяц: на годовом периоде факт-бар был ~47%
      // бюджета и непрошедшая часть года читалась как «экономия −50%».
      const remainingBudgetByCategory = new Map<number, number>();
      const remainingIncluded = months.some((m) => m >= currentMonth);
      if (budgetDetail) {
        for (const version of budgetDetail.versions) {
          for (const item of version.info.items) {
            const monthKey = item.date.substring(0, 7);
            if (!months.includes(monthKey)) continue;
            const cat = categories.items.find((c) => c.operationCategoryId === item.operationCategoryId);
            if (!cat || cat.operationCategoryType !== "Outcome") continue;
            const parentId = getFirstLevelParent(item.operationCategoryId);
            budgetByCategory.set(parentId, (budgetByCategory.get(parentId) || 0) + Math.abs(item.value));
            if (monthKey >= currentMonth) {
              remainingBudgetByCategory.set(parentId, (remainingBudgetByCategory.get(parentId) || 0) + Math.abs(item.value));
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
        const remainingBudget = remainingIncluded ? (remainingBudgetByCategory.get(id) || 0) : 0;
        const factWithRemaining = data.value + remainingBudget;
        if (factWithRemaining === 0 && budgetVal === 0) continue;
        expenseCategories.push({
          id,
          name: data.name,
          fact: factWithRemaining,
          budget: budgetVal,
        });
        addedIds.add(id);
      }
      if (remainingIncluded) {
        for (const [id, budgetRemaining] of remainingBudgetByCategory) {
          if (addedIds.has(id)) continue;
          const budgetVal = budgetByCategory.get(id) || 0;
          const cat = categories.items.find((c) => c.operationCategoryId === id);
          if (budgetRemaining === 0 && budgetVal === 0) continue;
          expenseCategories.push({
            id,
            name: cat?.title || `Статья ${id}`,
            fact: budgetRemaining,
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

    // Култ: сделки периода с пустой «Датой акта» не попадают в бакеты графика
    // маржинальности — бейдж в UI подсвечивает эту дыру в данных amoCRM.
    // Считаем по created-фетчу (сделки, созданные в периоде) — как прокси
    // «относится к периоду», раз собственной анкер-даты у них нет.
    // Сделки в финальных статусах без «Даты акта» — тихо выпадают из маржинальности,
    // подсвечиваем бейджем у обоих контуров. Култ — из счётчика проектов (created),
    // Бластер — из отдельного created-прохода (основной набор идёт по акту).
    const actCheckSource = isCult
      ? Array.from(projectsByMonth.values()).flat()
      : (blasterActCheck ?? []);
    const projectsWithoutAct = actCheckSource
      .filter((p) => p.hasActDate === false)
      .map((p) => ({ id: p.id, name: p.name }));

    // Лиды в «запросных» статусах без «Бриф получен» — бейдж у бизнес-уравнения.
    const withoutBriefSource = isCult ? cultCounts?.withoutBrief : blasterCounts?.withoutBrief;
    const projectsWithoutBrief = withoutBriefSource
      ? withoutBriefSource
          .filter((l) => {
            const created = new Date(l.createdAt * 1000).toLocaleDateString("sv-SE", { timeZone: BUSINESS_TZ });
            return created >= startDate && created <= endDate;
          })
          .map((l) => ({ id: l.id, name: l.name }))
      : undefined;

    // Знаменатель «% от выручки» в бюджете расходов — в том же базисе, что и бары:
    // прошедшие месяцы (< текущего) факт-выручкой, текущий и будущие — бюджет-выручкой.
    // Числитель баров сделан так же (F4), поэтому доля стабильна на любом периоде.
    let expenseBaseRevenue = 0;
    for (const mm of monthly) {
      expenseBaseRevenue += mm.month < currentMonth ? mm.revenue : mm.budgetRevenue;
    }

    const response: KpiResponse = {
      revenue: totalRevenue,
      expenseBaseRevenue,
      variableExpenses: totalVariableExpenses,
      margin: totalMargin,
      marginPercent: totalMarginPercent,
      fixedExpenses: totalFixedExpenses,
      profit: totalProfit,
      projectsCount: Array.from(projectsByMonth.values()).reduce((sum, p) => sum + p.length, 0),
      monthly,
      expenseCategories,
      budgetLabel,
      budgetMeta,
      syncedAt: new Date().toISOString(),
      sources: { planfact: "ok", amocrm: amocrmStatus, ...(budgetStatus ? { budget: budgetStatus } : {}) },
      projectsWithoutAct,
      projectsWithoutBrief,
    };

    // Платёжные дни (ср / пт–вс): деньги PlanFact — из снимка до окна, Amo — живой.
    // Снимок в эти дни не перезаписываем (иначе затрём «вт/чт 23:59» платёжным шумом).
    const freeze = getPlanFactFreezeState();
    const preFreezeSnap = freeze.active
      ? await readSnapshot<KpiResponse>(snapshotKey)
      : null;
    const canFreezePf = !!(
      freeze.active
      && freeze.asOfLabel
      && preFreezeSnap
      && isSnapshotBeforeFreeze(preFreezeSnap.snapshotAt, freeze)
    );

    const out = canFreezePf
      ? mergeKpiPlanFactFromSnapshot(response, preFreezeSnap!.payload, {
          planFactAsOf: freeze.asOfLabel!,
        })
      : response;

    if (amocrmStatus === "ok" && !budgetStatus && !freeze.active) {
      await saveSnapshot(snapshotKey, response);
    }

    return NextResponse.json(out);
  } catch (error) {
    console.error("KPI API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
