import { NextRequest, NextResponse } from "next/server";
import { authorizeKpi, kpiPeriod } from "@/lib/second-brain-access.mjs";
import { GET as dashboardKpi } from "@/app/api/kpi/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A machine-only endpoint: browser sessions do not grant access here.
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const access = authorizeKpi(
    request.headers.get("authorization"), process.env.SECOND_BRAIN_API_CLIENTS,
  );
  if (!access.ok) {
    return NextResponse.json({ error: access.status === 503 ? "API not configured" : "Access denied" },
      { status: access.status, headers });
  }
  const period = kpiPeriod(request.nextUrl.searchParams);
  if (!period) {
    return NextResponse.json({ error: "Provide startDate and endDate (YYYY-MM-DD), up to 366 days apart. No other parameters accepted." },
      { status: 400, headers });
  }
  try {
    // Reuse the dashboard's formulas, exclusions, snapshots and freeze rules.
    // Company selection is fixed server-side; Blaster cannot be requested.
    const url = new URL("/api/kpi", request.url);
    url.searchParams.set("entity", "cult");
    url.searchParams.set("startDate", period.start!);
    url.searchParams.set("endDate", period.end!);
    const response = await dashboardKpi(new NextRequest(url));
    if (!response.ok) {
      return NextResponse.json({ error: "Dashboard data unavailable" }, { status: 502, headers });
    }
    return NextResponse.json({
      entity: "cult", period,
      source: "finance-dashboard", fetchedAt: new Date().toISOString(),
      data: await response.json(),
    }, { headers });
  } catch {
    return NextResponse.json({ error: "Dashboard data unavailable" }, { status: 502, headers });
  }
}
