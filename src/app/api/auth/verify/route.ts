import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const base = process.env.BASE_URL || request.url;
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid", base));
  }

  const email = verifyToken(token);

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=expired", base));
  }

  const session = createSession(email);
  const response = NextResponse.redirect(new URL("/", base));

  response.cookies.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
