import { NextResponse } from "next/server";
import { createPlanFactClient } from "@/lib/planfact-client";

export async function GET() {
  try {
    const pf = createPlanFactClient(process.env.PLANFACT_API_KEY || "");
    const data = await pf.getCompanies();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Companies API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
