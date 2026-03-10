import test from "node:test";
import assert from "node:assert/strict";

import { __accountImportTestHooks, createAccountActions } from "../account-actions.js";

test("chunkItems splits import payload into fixed-size batches", () => {
  const input = Array.from({ length: 123 }, (_, index) => index + 1);
  const batches = __accountImportTestHooks.chunkItems(input, 50);

  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 50);
  assert.equal(batches[1].length, 50);
  assert.equal(batches[2].length, 23);
});

test("importContentsInParallel aggregates batched import results", async () => {
  const contents = Array.from({ length: 120 }, (_, index) => `account-${index + 1}`);
  const seenBatchSizes = [];

  const summary = await __accountImportTestHooks.importContentsInParallel(
    contents,
    async (batch) => {
      seenBatchSizes.push(batch.length);
      return {
        total: batch.length,
        created: batch.length - 1,
        updated: 1,
        failed: 0,
        errors: [],
      };
    },
  );

  assert.deepEqual(seenBatchSizes, [50, 50, 20]);
  assert.equal(summary.total, 120);
  assert.equal(summary.created, 117);
  assert.equal(summary.updated, 3);
  assert.equal(summary.failed, 0);
  assert.deepEqual(summary.errors, []);
});

test("importContentsInParallel records failed batch as failed items", async () => {
  const contents = Array.from({ length: 55 }, (_, index) => `account-${index + 1}`);

  const summary = await __accountImportTestHooks.importContentsInParallel(
    contents,
    async (batch) => {
      if (batch[0] === "account-51") {
        throw new Error("batch failed");
      }
      return {
        total: batch.length,
        created: batch.length,
        updated: 0,
        failed: 0,
        errors: [],
      };
    },
  );

  assert.equal(summary.total, 55);
  assert.equal(summary.created, 50);
  assert.equal(summary.updated, 0);
  assert.equal(summary.failed, 5);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.errors[0].index, 51);
  assert.match(summary.errors[0].message, /batch failed/);
});

test("deleteSelectedAccounts removes selected ids after bulk delete succeeds", async () => {
  const previousWindow = globalThis.window;
  const invokeCalls = [];
  const toasts = [];
  let refreshCount = 0;

  globalThis.window = {
    __TAURI__: {
      core: {
        invoke: async (method, params) => {
          invokeCalls.push({ method, params });
          if (method === "service_account_delete_many") {
            return {
              result: {
                requested: 2,
                deleted: 2,
                failed: 0,
                deletedAccountIds: ["acc-1", "acc-2"],
                errors: [],
              },
            };
          }
          throw new Error(`unexpected invoke: ${method}`);
        },
      },
    },
  };

  const localState = {
    selectedAccountIds: new Set(["acc-1", "acc-2"]),
    usageList: [],
  };
  const actions = createAccountActions({
    state: localState,
    ensureConnected: async () => true,
    refreshAccountsAndUsage: async () => {
      refreshCount += 1;
      return true;
    },
    renderAccountsView: () => {},
    renderCurrentPageView: () => {},
    showToast: (message, type = "info") => {
      toasts.push({ message, type });
    },
    showConfirmDialog: async () => true,
  });

  try {
    await actions.deleteSelectedAccounts();
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].method, "service_account_delete_many");
    assert.deepEqual(invokeCalls[0].params.accountIds, ["acc-1", "acc-2"]);
    assert.equal(localState.selectedAccountIds.size, 0);
    assert.equal(refreshCount, 1);
    assert.deepEqual(toasts, [{ message: "已删除 2 个账号", type: "info" }]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("deleteSelectedAccounts falls back to single delete when bulk command is unavailable", async () => {
  const previousWindow = globalThis.window;
  const invokeCalls = [];
  const toasts = [];
  let refreshCount = 0;

  globalThis.window = {
    __TAURI__: {
      core: {
        invoke: async (method, params) => {
          invokeCalls.push({ method, params });
          if (method === "service_account_delete_many") {
            throw new Error("unknown command");
          }
          if (method === "service_account_delete" && params.accountId === "acc-1") {
            return { result: { ok: true } };
          }
          if (method === "service_account_delete" && params.accountId === "acc-2") {
            return { result: { ok: false, error: "delete failed" } };
          }
          throw new Error(`unexpected invoke: ${method}`);
        },
      },
    },
  };

  const localState = {
    selectedAccountIds: new Set(["acc-1", "acc-2"]),
    usageList: [],
  };
  const actions = createAccountActions({
    state: localState,
    ensureConnected: async () => true,
    refreshAccountsAndUsage: async () => {
      refreshCount += 1;
      return true;
    },
    renderAccountsView: () => {},
    renderCurrentPageView: () => {},
    showToast: (message, type = "info") => {
      toasts.push({ message, type });
    },
    showConfirmDialog: async () => true,
  });

  try {
    await actions.deleteSelectedAccounts();
    assert.deepEqual(
      invokeCalls.map((item) => item.method),
      ["service_account_delete_many", "service_account_delete", "service_account_delete"],
    );
    assert.deepEqual(Array.from(localState.selectedAccountIds), ["acc-2"]);
    assert.equal(refreshCount, 1);
    assert.deepEqual(toasts, [
      { message: "已删除 1 个账号，失败 1 个", type: "info" },
      { message: "首个失败账号 acc-2: delete failed", type: "error" },
    ]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("importAccountsFromRegisterDb triggers rpc import and refresh", async () => {
  const previousWindow = globalThis.window;
  const invokeCalls = [];
  const toasts = [];
  let refreshCount = 0;

  globalThis.window = {
    __TAURI__: {
      core: {
        invoke: async (method) => {
          invokeCalls.push(method);
          if (method === "service_account_import_from_register_db") {
            return {
              result: {
                total: 2,
                created: 1,
                updated: 1,
                failed: 0,
                errors: [],
              },
            };
          }
          throw new Error(`unexpected invoke: ${method}`);
        },
      },
    },
  };

  const localState = {
    selectedAccountIds: new Set(),
    usageList: [],
  };
  const actions = createAccountActions({
    state: localState,
    ensureConnected: async () => true,
    refreshAccountsAndUsage: async () => {
      refreshCount += 1;
      return true;
    },
    renderAccountsView: () => {},
    renderCurrentPageView: () => {},
    showToast: (message, type = "info") => {
      toasts.push({ message, type });
    },
    showConfirmDialog: async () => true,
  });

  try {
    assert.equal(typeof actions.importAccountsFromRegisterDb, "function");
    await actions.importAccountsFromRegisterDb();
    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0], "service_account_import_from_register_db");
    assert.equal(refreshCount, 1);
    assert.equal(toasts.length > 0, true);
    assert.match(toasts[toasts.length - 1].message, /导入完成/);
  } finally {
    globalThis.window = previousWindow;
  }
});
