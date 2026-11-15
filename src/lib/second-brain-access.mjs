import { createHash, timingSafeEqual } from "node:crypto";

/** Machine credentials are scoped to Cult financial KPI. End-user authorization
 * is performed by MCP before using this credential; never distribute it to staff.
 * @param {string | null} authorization
 * @param {string | undefined} configuration
 */
export function authorizeKpi(authorization, configuration) {
  let clients;
  try {
    clients = JSON.parse(configuration || "");
    if (!Array.isArray(clients) || clients.length === 0 || clients.some((c) =>
      !c || typeof c.id !== "string" || !c.id.trim() ||
      typeof c.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(c.sha256) ||
      !Array.isArray(c.scopes) || c.scopes.some((s) => s !== "cult:finance:kpi:read")
    ) || new Set(clients.map((c) => c.id)).size !== clients.length ||
      new Set(clients.map((c) => c.sha256)).size !== clients.length) throw new Error();
  } catch {
    return { ok: false, status: 503 };
  }
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization || "");
  if (!match) return { ok: false, status: 401 };
  const digest = createHash("sha256").update(match[1]).digest();
  const client = clients.find((c) => timingSafeEqual(digest, Buffer.from(c.sha256, "hex")));
  if (!client) return { ok: false, status: 401 };
  if (!client.scopes.includes("cult:finance:kpi:read")) return { ok: false, status: 403 };
  return { ok: true, status: 200, clientId: client.id };
}

/** @param {URLSearchParams} params */
export function kpiPeriod(params) {
  const allowed = new Set(["startDate", "endDate"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return null;
  }
  const start = params.get("startDate");
  const end = params.get("endDate");
  const valid = (/** @type {string | null} */ value) => {
    if (!value || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  };
  if (!valid(start) || !valid(end)) return null;
  const days = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (days < 0 || days > 366) return null;
  return { start, end };
}
