import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { authorizeKpi, kpiPeriod } from "../src/lib/second-brain-access.mjs";

const token = "test_only_not_a_real_key_".padEnd(48, "x");
const hash = createHash("sha256").update(token).digest("hex");
const config = JSON.stringify([{ id: "test", sha256: hash, scopes: ["cult:finance:kpi:read"] }]);
test("configured financial client is accepted", () => {
  assert.equal(authorizeKpi("Bearer " + token, config).ok, true);
});
test("missing, cookie-only, invalid and unknown credentials denied", () => {
  for (const auth of [null, "session=abc", "Bearer short", "Bearer " + "z".repeat(48)])
    assert.equal(authorizeKpi(auth, config).status, 401);
});
test("missing or malformed configuration fails closed", () => {
  for (const config of [undefined, "", "[]", "{}", "bad", '[{"sha256":"abc"}]'])
    assert.equal(authorizeKpi("Bearer " + token, config).status, 503);
});
test("read credential without financial scope denied", () => {
  assert.equal(authorizeKpi("Bearer " + token, JSON.stringify([{ id: "producer", sha256: hash, scopes: [] }])).status, 403);
});
test("duplicates and unknown scopes rejected", () => {
  const c = JSON.parse(config);
  assert.equal(authorizeKpi("Bearer " + token, JSON.stringify([...c, ...c])).status, 503);
  c[0].scopes.push("all");
  assert.equal(authorizeKpi("Bearer " + token, JSON.stringify(c)).status, 503);
});
test("leap day and annual period accepted", () => {
  for (const q of ["startDate=2024-02-29&endDate=2024-03-01", "startDate=2026-01-01&endDate=2026-12-31"])
    assert.ok(kpiPeriod(new URLSearchParams(q)));
});
test("company override, duplicate parameters, invalid and unbounded dates denied", () => {
  for (const q of [
    "startDate=2026-01-01&endDate=2026-12-31&entity=blaster",
    "startDate=2026-01-01&endDate=2026-12-31&snapshot=1",
    "startDate=2026-01-01&startDate=2026-02-01&endDate=2026-12-31",
    "startDate=2026-02-30&endDate=2026-03-01", "startDate=2026-02-01&endDate=2026-01-01",
    "startDate=2020-01-01&endDate=2026-12-31", "",
  ]) assert.equal(kpiPeriod(new URLSearchParams(q)), null);
});
