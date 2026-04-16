import { NextRequest, NextResponse } from "next/server";
// import { verifySessionEdge } from "@/lib/auth-edge";

// AUTH DISABLED FOR LOCAL UI DEVELOPMENT
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
