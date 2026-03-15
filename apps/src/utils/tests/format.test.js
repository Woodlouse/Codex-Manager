import test from "node:test";
import assert from "node:assert/strict";

import {
  calcAvailability,
  computeAggregateRemainingStats,
  computeUsageStats,
  formatCompactNumber,
  formatResetLabel,
  formatTs,
} from "../format.js";

test("calcAvailability treats missing primary fields as unavailable", () => {
  const usage = {
    usedPercent: null,
    windowMinutes: 300,
    secondaryUsedPercent: 10,
    secondaryWindowMinutes: 10080,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "bad");
});

test("calcAvailability treats fully missing secondary fields as single-window available", () => {
  const usage = {
    usedPercent: 10,
    windowMinutes: 300,
    secondaryUsedPercent: null,
    secondaryWindowMinutes: null,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "ok");
  assert.equal(result.text, "单窗口可用");
});

test("calcAvailability prefers backend availabilityStatus mapping when present", () => {
  const usage = {
    availabilityStatus: "primary_window_available_only",
    usedPercent: 100,
    windowMinutes: 300,
    secondaryUsedPercent: 100,
    secondaryWindowMinutes: 10080,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "ok");
  assert.equal(result.text, "单窗口可用");
});

test("calcAvailability maps backend unavailable status to unified label", () => {
  const usage = {
    availabilityStatus: "unavailable",
    usedPercent: 10,
    windowMinutes: 300,
    secondaryUsedPercent: 5,
    secondaryWindowMinutes: 10080,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "bad");
  assert.equal(result.text, "不可用");
});

test("calcAvailability prefers inactive account status before usage snapshot", () => {
  const usage = {
    availabilityStatus: "available",
    usedPercent: 0,
    windowMinutes: 300,
    secondaryUsedPercent: 0,
    secondaryWindowMinutes: 10080,
  };
  const result = calcAvailability(usage, { status: "inactive" });
  assert.equal(result.level, "bad");
  assert.equal(result.text, "不可用");
});

test("calcAvailability treats partial secondary fields as unavailable", () => {
  const usage = {
    usedPercent: 10,
    windowMinutes: 300,
    secondaryUsedPercent: null,
    secondaryWindowMinutes: 10080,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "bad");
});

test("calcAvailability keeps primary exhausted unavailable even in single-window mode", () => {
  const usage = {
    usedPercent: 100,
    windowMinutes: 300,
    secondaryUsedPercent: null,
    secondaryWindowMinutes: null,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "warn");
  assert.equal(result.text, "5小时已用尽");
});

test("calcAvailability keeps ok when both windows present and under limit", () => {
  const usage = {
    usedPercent: 10,
    windowMinutes: 300,
    secondaryUsedPercent: 5,
    secondaryWindowMinutes: 10080,
  };
  const result = calcAvailability(usage);
  assert.equal(result.level, "ok");
});

test("computeUsageStats returns total/ok/unavailable/lowCount in one pass", () => {
  const accounts = [
    { id: "a1" },
    { id: "a2" },
    { id: "a3" },
  ];
  const usageMap = new Map([
    [
      "a1",
      {
        accountId: "a1",
        usedPercent: 10,
        windowMinutes: 300,
        secondaryUsedPercent: 5,
        secondaryWindowMinutes: 10080,
      },
    ],
    [
      "a2",
      {
        accountId: "a2",
        usedPercent: 95,
        windowMinutes: 300,
        secondaryUsedPercent: 50,
        secondaryWindowMinutes: 10080,
      },
    ],
    [
      "a3",
      {
        accountId: "a3",
        usedPercent: 100,
        windowMinutes: 300,
        secondaryUsedPercent: 100,
        secondaryWindowMinutes: 10080,
      },
    ],
  ]);

  const stats = computeUsageStats(accounts, usageMap);
  assert.equal(stats.total, 3);
  assert.equal(stats.okCount, 2);
  assert.equal(stats.unavailableCount, 1);
  assert.equal(stats.lowCount, 2);
});

test("computeAggregateRemainingStats aggregates 5h and 7d remaining percent", () => {
  const accounts = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  const usageMap = new Map([
    ["a1", { accountId: "a1", usedPercent: 20, windowMinutes: 300, secondaryUsedPercent: 10 }],
    ["a2", { accountId: "a2", usedPercent: 50, windowMinutes: 300, secondaryUsedPercent: 80 }],
    ["a3", { accountId: "a3", usedPercent: null, secondaryUsedPercent: null }],
  ]);

  const stats = computeAggregateRemainingStats(accounts, usageMap);
  assert.equal(stats.totalAccounts, 3);
  assert.equal(stats.primaryBucketCount, 2);
  assert.equal(stats.primaryKnownCount, 2);
  assert.equal(stats.primaryUnknownCount, 0);
  assert.equal(stats.primaryRemainPercent, 65);
  assert.equal(stats.secondaryBucketCount, 2);
  assert.equal(stats.secondaryKnownCount, 2);
  assert.equal(stats.secondaryUnknownCount, 0);
  assert.equal(stats.secondaryRemainPercent, 55);
});

test("computeAggregateRemainingStats counts free single-window account into 7d bucket", () => {
  const accounts = [{ id: "paid" }, { id: "free" }];
  const usageMap = new Map([
    [
      "paid",
      {
        accountId: "paid",
        usedPercent: 20,
        windowMinutes: 300,
        secondaryUsedPercent: 40,
        secondaryWindowMinutes: 10080,
      },
    ],
    [
      "free",
      {
        accountId: "free",
        usedPercent: 10,
        windowMinutes: 10080,
        secondaryUsedPercent: null,
        secondaryWindowMinutes: null,
        creditsJson: JSON.stringify({ planType: "free" }),
      },
    ],
  ]);

  const stats = computeAggregateRemainingStats(accounts, usageMap);
  assert.equal(stats.primaryBucketCount, 1);
  assert.equal(stats.primaryKnownCount, 1);
  assert.equal(stats.primaryUnknownCount, 0);
  assert.equal(stats.primaryRemainPercent, 80);
  assert.equal(stats.secondaryBucketCount, 2);
  assert.equal(stats.secondaryKnownCount, 2);
  assert.equal(stats.secondaryUnknownCount, 0);
  assert.equal(stats.secondaryRemainPercent, 75);
});

test("formatTs supports custom empty label", () => {
  assert.equal(formatTs(0, { emptyLabel: "-" }), "-");
  assert.equal(formatTs(null, { emptyLabel: "-" }), "-");
});

test("formatResetLabel does not duplicate month unit", () => {
  const futureTs = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
  const label = formatResetLabel(futureTs);
  assert.equal(label.includes("月月"), false);
  assert.match(label, /^重置：\d+月\d+日 \d{2}:\d{2}$/);
});

test("formatCompactNumber renders K/M suffixes for large values", () => {
  assert.equal(formatCompactNumber(999), "999");
  assert.equal(formatCompactNumber(1_165), "1.2K");
  assert.equal(formatCompactNumber(22_929), "22.9K");
  assert.equal(formatCompactNumber(439_808), "439.8K");
  assert.equal(formatCompactNumber(7_200_000), "7.2M");
});

test("formatCompactNumber handles invalid values with fallback", () => {
  assert.equal(formatCompactNumber(null), "-");
  assert.equal(formatCompactNumber(""), "-");
  assert.equal(formatCompactNumber("nope", { fallback: "0" }), "0");
});
