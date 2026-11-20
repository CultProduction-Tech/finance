import type { NextRequest } from "next/server";
import type { LegalEntity } from "@/types/finance";
import { loadCashflow } from "@/lib/cashflow";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const entity = (params.get("entity") || "blaster") as LegalEntity;
  return loadCashflow(entity, {
    snapshotOnly: params.get("snapshot") === "1",
    persistSnapshot: true,
  });
}
