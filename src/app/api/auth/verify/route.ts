import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }

  const email = verifyToken(token);

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  const session = createSession(email);
  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.set("session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
