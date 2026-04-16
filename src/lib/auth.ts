import { cookies } from "next/headers";
import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "default-secret-change-me";
const ALLOWED_DOMAINS = (process.env.AUTH_ALLOWED_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
const TOKEN_TTL = 15 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

const pendingTokens = new Map<string, { email: string; expires: number }>();

export function isEmailAllowed(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => domain === d);
}

export function generateToken(email: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  pendingTokens.set(token, { email, expires: Date.now() + TOKEN_TTL });
  return token;
}

export function verifyToken(token: string): string | null {
  const entry = pendingTokens.get(token);
  if (!entry) return null;
  pendingTokens.delete(token);
  if (Date.now() > entry.expires) return null;
  return entry.email;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function createSession(email: string): string {
  const expires = Date.now() + SESSION_TTL;
  const payload = JSON.stringify({ email, expires });
  const signature = sign(payload);
  return Buffer.from(JSON.stringify({ payload, signature })).toString("base64");
}

export function verifySession(sessionCookie: string): string | null {
  try {
    const { payload, signature } = JSON.parse(Buffer.from(sessionCookie, "base64").toString());
    if (sign(payload) !== signature) return null;
    const { email, expires } = JSON.parse(payload);
    if (Date.now() > expires) return null;
    return email;
  } catch {
    return null;
  }
}

export async function getAuthEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) return null;
  return verifySession(session);
}
