import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/planfact-client";

export async function GET() {
  try {
    const data = await getCompanies();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Companies API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
