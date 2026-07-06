import { cookies } from "next/headers";
import crypto from "crypto";
import { checkHubAccess } from "./hub-client";

// fail loud: в проде без AUTH_SECRET сессии подписывались бы публично известной строкой
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET обязателен в production");
}
const SECRET = process.env.AUTH_SECRET || "default-secret-change-me";
const ALLOWED_DOMAINS = (process.env.AUTH_ALLOWED_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
const ALLOWED_EMAILS = (process.env.AUTH_ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const TOKEN_TTL = 15 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

const pendingTokens = new Map<string, { email: string; expires: number }>();

/**
 * Логика проверки доступа:
 *   1) Домен в AUTH_ALLOWED_DOMAINS → пускаем (cult.team / blasterstudio.ru) — не дёргаем Hub
 *   2) Иначе спрашиваем Feature Hub: есть ли у этого email доступ к unit=finance
 *   3) Если Hub недоступен (таймаут / 5xx / не настроен) — фолбэк на env AUTH_ALLOWED_EMAILS
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.toLowerCase();

  // 1. Домен (cult.team, blasterstudio.ru)
  const domain = normalized.split("@")[1];
  if (ALLOWED_DOMAINS.some((d) => domain === d)) return true;

  // 2. Feature Hub
  const hubResult = await checkHubAccess(normalized);
  if (hubResult === true) return true;
  if (hubResult === false) return false;

  // 3. Hub недоступен → env-фолбэк
  return ALLOWED_EMAILS.includes(normalized);
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
