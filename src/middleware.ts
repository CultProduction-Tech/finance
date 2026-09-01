import { NextRequest, NextResponse } from "next/server";
import { verifySessionEdge } from "@/lib/auth-edge";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/cron", "/icon.png", "/_next", "/favicon.ico"];

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Прогрев снимков: cron дергает /api/kpi и /api/cashflow с CRON_SECRET
  if (
    isCronAuthorized(request)
    && (pathname.startsWith("/api/kpi") || pathname.startsWith("/api/cashflow"))
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session")?.value;

  if (!session || !(await verifySessionEdge(session))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
