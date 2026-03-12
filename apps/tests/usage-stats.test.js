import test from "node:test";
import assert from "node:assert/strict";
import { computeUsageStats } from "../src/utils/format.js";

test("computeUsageStats aggregates counts", () => {
  const accounts = [{ id: "a" }, { id: "b" }];
  const usage = [
    { accountId: "a", usedPercent: 20, secondaryUsedPercent: 40 },
    { accountId: "b", usedPercent: 80, secondaryUsedPercent: 10 },
  ];
  const out = computeUsageStats(accounts, usage);
  assert.equal(out.total, 2);
  assert.equal(out.lowCount, 1);
});
