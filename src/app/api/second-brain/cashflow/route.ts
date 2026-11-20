import type { NextRequest } from "next/server";
import { CASHFLOW_ALLOW, cashflowRead } from "@/lib/second-brain-cashflow.mjs";
import { loadCashflow } from "@/lib/cashflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same Cult financial-reader credential as KPI. Caller identities/roles remain in MCP.
export async function GET(request: NextRequest) {
  return cashflowRead(request, process.env.SECOND_BRAIN_API_CLIENTS,
    (entity) => loadCashflow(entity, { persistSnapshot: false }));
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: CASHFLOW_ALLOW } });
}
