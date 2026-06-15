/**
 * Клиент Feature Hub для проверки доступа к дашборду.
 *
 * GET {HUB_URL}/api/internal/access?email=<email>&unit=finance
 * Headers: X-Service-Token: <секрет>
 *
 * → 200 { allowed: true/false }
 * → 401/400 — ошибки авторизации/параметров
 *
 * На стороне дашборда:
 *   - кэш на 5 минут чтобы не дёргать Hub при каждом логине
 *   - таймаут 2 секунды
 *   - при ошибке возвращаем null → вызывающий код падает на env-фолбэк
 */

const HUB_URL = process.env.HUB_URL || "";
const HUB_SERVICE_TOKEN = process.env.HUB_SERVICE_TOKEN || "";
const UNIT = "finance";

const CACHE_TTL = 5 * 60 * 1000; // 5 минут
const REQUEST_TIMEOUT = 2000;    // 2 секунды

const cache = new Map<string, { allowed: boolean; expiresAt: number }>();

/**
 * Возвращает:
 *   true  — Hub подтвердил доступ
 *   false — Hub явно отказал
 *   null  — Hub недоступен/упал/не настроен → вызывающий код решает что делать (обычно фолбэк на env)
 */
export async function checkHubAccess(email: string): Promise<boolean | null> {
  if (!HUB_URL || !HUB_SERVICE_TOKEN) return null;

  const normalized = email.toLowerCase().trim();
  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.allowed;
  }

  const url = `${HUB_URL.replace(/\/$/, "")}/api/internal/access?email=${encodeURIComponent(normalized)}&unit=${UNIT}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: { "X-Service-Token": HUB_SERVICE_TOKEN },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`Hub access check: HTTP ${res.status} for ${normalized}`);
      return null;
    }

    const data = (await res.json()) as { allowed?: boolean };
    const allowed = data.allowed === true;
    cache.set(normalized, { allowed, expiresAt: Date.now() + CACHE_TTL });
    return allowed;
  } catch (err) {
    clearTimeout(timer);
    console.warn("Hub access check failed:", err);
    return null;
  }
}
