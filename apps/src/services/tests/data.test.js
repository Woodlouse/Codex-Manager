import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../../state.js";
import {
  hydrateFromStartupSnapshot,
  refreshUsageAggregateSummary,
  refreshAccountsPage,
  refreshRequestLogs,
} from "../data.js";

function deferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // 中文注释：避免某些取消路径下 deferred promise 未被 await 时触发 unhandledRejection。
  promise.catch(() => {});
  return { promise, resolve, reject };
}

test("refreshRequestLogs aborts stale request when query changes", async () => {
  const oldWindow = globalThis.window;
  const first = deferred();
  const second = deferred();
  const seenQueries = [];

  try {
    globalThis.window = {
      __TAURI__: {
        core: {
          invoke: async (method, params) => {
            if (method === "service_requestlog_list") {
              const query = params?.query;
              seenQueries.push(query);
              if (query === "old") {
                await first.promise;
                return { result: { items: [{ id: "old" }] } };
              }
              await second.promise;
              return { result: { items: [{ id: "new" }] } };
            }
            throw new Error(`unexpected invoke: ${method}`);
          },
        },
      },
    };

    state.serviceAddr = "localhost:48760";
    state.requestLogList = [];

    const oldTask = refreshRequestLogs("old", { latestOnly: true });
    await Promise.resolve();
    const newTask = refreshRequestLogs("new", { latestOnly: true });

    first.reject(new DOMException("The operation was aborted.", "AbortError"));
    second.resolve();

    const oldApplied = await oldTask;
    const newApplied = await newTask;

    assert.equal(oldApplied, false);
    assert.equal(newApplied, true);
    assert.ok(seenQueries.includes("new"));
    assert.equal(state.requestLogList.length, 1);
    assert.equal(state.requestLogList[0].id, "new");
    assert.ok(state.requestLogList[0].__identity);
  } finally {
    globalThis.window = oldWindow;
  }
});

test("refreshAccountsPage falls back to local mode when backend does not return pagination fields", async () => {
  const oldWindow = globalThis.window;

  try {
    globalThis.window = {
      __TAURI__: {
        core: {
          invoke: async (method, params) => {
            if (method === "service_account_list") {
              assert.equal(params.page, 1);
              assert.equal(params.pageSize, 5);
              return {
                result: {
                  items: [
                    { id: "acc-1", label: "账号1", groupName: "A组", sort: 1 },
                    { id: "acc-2", label: "账号2", groupName: "A组", sort: 2 },
                  ],
                },
              };
            }
            throw new Error(`unexpected invoke: ${method}`);
          },
        },
      },
    };

    state.accountList = [];
    state.accountPage = 1;
    state.accountPageSize = 5;
    state.accountSearch = "";
    state.accountFilter = "all";
    state.accountGroupFilter = "all";
    state.accountPageItems = [];
    state.accountPageTotal = 0;
    state.accountPageLoaded = false;

    const applied = await refreshAccountsPage({ latestOnly: true });

    assert.equal(applied, true);
    assert.equal(state.accountPageLoaded, false);
    assert.equal(state.accountPageTotal, 0);
    assert.equal(state.accountPageItems.length, 0);
    assert.equal(state.accountList.length, 2);
    assert.equal(state.accountList[0].id, "acc-1");
  } finally {
    globalThis.window = oldWindow;
  }
});

test("hydrateFromStartupSnapshot fills startup cache state in one shot", async () => {
  const oldWindow = globalThis.window;

  try {
    globalThis.window = {
      __TAURI__: {
        core: {
          invoke: async (method) => {
            if (method === "service_startup_snapshot") {
              return {
                result: {
                  accounts: [
                    { id: "acc-1", label: "账号1", groupName: "TEAM", sort: 0, status: "active" },
                    { id: "acc-2", label: "账号2", groupName: "TEAM", sort: 1, status: "active" },
                  ],
                  usageSnapshots: [
                    { accountId: "acc-1", availabilityStatus: "available", usedPercent: 20, windowMinutes: 300 },
                  ],
                  usageAggregateSummary: {
                    primaryBucketCount: 1,
                    primaryKnownCount: 1,
                    primaryUnknownCount: 0,
                    primaryRemainPercent: 80,
                    secondaryBucketCount: 1,
                    secondaryKnownCount: 1,
                    secondaryUnknownCount: 0,
                    secondaryRemainPercent: 60,
                  },
                  apiKeys: [
                    { id: "gk_1", name: "主 Key", protocolType: "openai_compat", status: "active" },
                  ],
                  apiModelOptions: [
                    { slug: "gpt-5.3-codex", displayName: "GPT-5.3 Codex" },
                  ],
                  manualPreferredAccountId: "acc-2",
                  requestLogTodaySummary: {
                    todayTokens: 123,
                    cachedInputTokens: 45,
                    reasoningOutputTokens: 6,
                    estimatedCost: 1.23,
                  },
                  requestLogs: [
                    { id: "log-1", accountId: "acc-1", createdAt: 1, method: "POST", statusCode: 200 },
                  ],
                },
              };
            }
            throw new Error(`unexpected invoke: ${method}`);
          },
        },
      },
    };

    state.accountPageSize = 5;
    state.accountList = [];
    state.usageList = [];
    state.apiKeyList = [];
    state.requestLogList = [];

    await hydrateFromStartupSnapshot({ requestLogLimit: 50 });

    assert.equal(state.accountList.length, 2);
    assert.equal(state.usageList.length, 1);
    assert.equal(state.usageAggregateSummary.primaryRemainPercent, 80);
    assert.equal(state.usageAggregateSummary.secondaryRemainPercent, 60);
    assert.equal(state.apiKeyList.length, 1);
    assert.equal(state.apiModelOptions.length, 1);
    assert.equal(state.manualPreferredAccountId, "acc-2");
    assert.equal(state.requestLogTodaySummary.todayTokens, 123);
    assert.equal(state.requestLogList.length, 1);
    assert.ok(state.requestLogList[0].__identity);
    assert.equal(state.accountPageLoaded, true);
    assert.equal(state.accountPageTotal, 2);
    assert.equal(state.accountPageItems.length, 2);
  } finally {
    globalThis.window = oldWindow;
  }
});

test("refreshUsageAggregateSummary fills backend aggregate summary into state", async () => {
  const oldWindow = globalThis.window;

  try {
    globalThis.window = {
      __TAURI__: {
        core: {
          invoke: async (method) => {
            if (method === "service_usage_aggregate") {
              return {
                result: {
                  primaryBucketCount: 1,
                  primaryKnownCount: 1,
                  primaryUnknownCount: 0,
                  primaryRemainPercent: 91,
                  secondaryBucketCount: 2,
                  secondaryKnownCount: 2,
                  secondaryUnknownCount: 0,
                  secondaryRemainPercent: 99,
                },
              };
            }
            throw new Error(`unexpected invoke: ${method}`);
          },
        },
      },
    };

    state.usageAggregateSummary = null;

    await refreshUsageAggregateSummary();

    assert.equal(state.usageAggregateSummary.primaryRemainPercent, 91);
    assert.equal(state.usageAggregateSummary.secondaryRemainPercent, 99);
    assert.equal(state.usageAggregateSummary.primaryBucketCount, 1);
    assert.equal(state.usageAggregateSummary.secondaryBucketCount, 2);
  } finally {
    globalThis.window = oldWindow;
  }
});
