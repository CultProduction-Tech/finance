import { NextRequest } from "next/server";
import { cashflowRead } from "@/lib/second-brain-cashflow.mjs";
import { GET as dashboardCashflow } from "@/app/api/cashflow/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same Cult financial-reader credential as KPI. Caller identities/roles remain in MCP.
export async function GET(request: NextRequest) {
  return cashflowRead(request, process.env.SECOND_BRAIN_API_CLIENTS,
    (url: URL) => dashboardCashflow(new NextRequest(url)));
}
