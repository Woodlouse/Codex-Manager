import { invoke, isTauriRuntime, rpcInvoke, withAddr } from "./transport.js";

async function exportAccountsByDirectoryPicker(result) {
  const picker = globalThis.window && window.showDirectoryPicker;
  if (typeof picker !== "function") {
    throw new Error("当前浏览器不支持目录导出，请使用 Chromium 内核浏览器或桌面端");
  }

  let directoryHandle;
  try {
    directoryHandle = await picker.call(window, { mode: "readwrite" });
  } catch (err) {
    if (err && (err.name === "AbortError" || err.code === 20)) {
      return { canceled: true };
    }
    throw err;
  }

  const files = Array.isArray(result?.files) ? result.files : [];
  for (const item of files) {
    const fileName = String(item?.fileName || "").trim();
    if (!fileName) continue;
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(String(item?.content || ""));
    } finally {
      await writable.close();
    }
  }

  return {
    ...result,
    canceled: false,
    outputDir: directoryHandle && directoryHandle.name ? directoryHandle.name : "",
  };
}

function normalizeAccountListOptions(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const normalized = {};
  const page = Number(source.page);
  const pageSize = Number(source.pageSize);
  const query = typeof source.query === "string" ? source.query.trim() : "";
  const filter = typeof source.filter === "string" ? source.filter.trim() : "";
  const groupFilter = typeof source.groupFilter === "string" ? source.groupFilter.trim() : "";

  if (Number.isFinite(page) && page > 0) {
    normalized.page = Math.trunc(page);
  }
  if (Number.isFinite(pageSize) && pageSize > 0) {
    normalized.pageSize = Math.trunc(pageSize);
  }
  if (query) {
    normalized.query = query;
  }
  if (filter) {
    normalized.filter = filter;
  }
  if (groupFilter && groupFilter !== "all") {
    normalized.groupFilter = groupFilter;
  }
  return normalized;
}

export async function serviceAccountList(options = {}) {
  const params = normalizeAccountListOptions(options);
  const payload = Object.keys(params).length > 0 ? params : undefined;
  if (!isTauriRuntime()) {
    return rpcInvoke("account/list", payload);
  }
  return invoke("service_account_list", payload ? withAddr(payload) : withAddr());
}

export async function serviceAccountDelete(accountId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/delete", { accountId });
  }
  return invoke("service_account_delete", withAddr({ accountId }));
}

export async function serviceAccountDeleteMany(accountIds) {
  const normalizedIds = Array.isArray(accountIds)
    ? accountIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!isTauriRuntime()) {
    return rpcInvoke("account/deleteMany", { accountIds: normalizedIds });
  }
  return invoke("service_account_delete_many", withAddr({ accountIds: normalizedIds }));
}

export async function serviceAccountDeleteUnavailableFree() {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/deleteUnavailableFree");
  }
  return invoke("service_account_delete_unavailable_free", withAddr());
}

export async function serviceAccountUpdate(accountId, sort) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/update", { accountId, sort });
  }
  return invoke("service_account_update", withAddr({ accountId, sort }));
}

export async function serviceAccountImport(contents) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/import", { contents });
  }
  return invoke("service_account_import", withAddr({ contents }));
}

export async function serviceAccountImportByDirectory() {
  if (!isTauriRuntime()) {
    throw new Error("浏览器模式暂不支持导入文件夹，请使用桌面端");
  }
  return invoke("service_account_import_by_directory", withAddr());
}

export async function serviceAccountExportByAccountFiles() {
  if (!isTauriRuntime()) {
    const result = await rpcInvoke("account/exportData");
    return exportAccountsByDirectoryPicker(result);
  }
  return invoke("service_account_export_by_account_files", withAddr());
}

export async function localAccountDelete(accountId) {
  if (!isTauriRuntime()) {
    return { ok: false, error: "浏览器模式不支持本地删除（请升级服务或使用桌面端）" };
  }
  return invoke("local_account_delete", { accountId });
}

export async function serviceUsageRead(accountId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/usage/read", accountId ? { accountId } : undefined);
  }
  return invoke("service_usage_read", withAddr({ accountId }));
}

export async function serviceUsageList() {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/usage/list");
  }
  return invoke("service_usage_list", withAddr());
}

export async function serviceUsageAggregate() {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/usage/aggregate");
  }
  return invoke("service_usage_aggregate", withAddr());
}

export async function serviceUsageRefresh(accountId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/usage/refresh", accountId ? { accountId } : undefined);
  }
  return invoke("service_usage_refresh", withAddr({ accountId }));
}

export async function serviceLoginStart(payload) {
  if (!isTauriRuntime()) {
    const safe = payload && typeof payload === "object" ? payload : {};
    return rpcInvoke("account/login/start", {
      type: safe.loginType || safe.type || "chatgpt",
      openBrowser: safe.openBrowser !== false,
      note: safe.note || null,
      tags: safe.tags || null,
      groupName: safe.groupName || null,
      workspaceId: safe.workspaceId || null,
    });
  }
  return invoke("service_login_start", withAddr(payload));
}

export async function serviceLoginStatus(loginId, options = {}) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/login/status", { loginId }, options);
  }
  return invoke("service_login_status", withAddr({ loginId }), options);
}

export async function serviceLoginComplete(loginState, code, redirectUri) {
  if (!isTauriRuntime()) {
    return rpcInvoke("account/login/complete", { state: loginState, code, redirectUri });
  }
  return invoke("service_login_complete", withAddr({ state: loginState, code, redirectUri }));
}

export async function serviceApiKeyList() {
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/list");
  }
  return invoke("service_apikey_list", withAddr());
}

export async function serviceApiKeyReadSecret(keyId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/readSecret", { id: keyId });
  }
  return invoke("service_apikey_read_secret", withAddr({ keyId }));
}

export async function serviceApiKeyCreate(name, modelSlug, reasoningEffort, profile = {}) {
  const params = {
    name,
    modelSlug,
    reasoningEffort,
    protocolType: profile.protocolType || null,
    upstreamBaseUrl: profile.upstreamBaseUrl || null,
    staticHeadersJson: profile.staticHeadersJson || null,
  };
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/create", params);
  }
  return invoke("service_apikey_create", withAddr(params));
}

export async function serviceApiKeyModels(options = {}) {
  const refreshRemote = options && options.refreshRemote === true;
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/models", refreshRemote ? { refreshRemote } : undefined);
  }
  return invoke("service_apikey_models", withAddr({ refreshRemote }));
}

export async function serviceApiKeyUpdateModel(keyId, modelSlug, reasoningEffort, profile = {}) {
  const params = {
    id: keyId,
    modelSlug,
    reasoningEffort,
    protocolType: profile.protocolType || null,
    upstreamBaseUrl: profile.upstreamBaseUrl || null,
    staticHeadersJson: profile.staticHeadersJson || null,
  };
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/updateModel", params);
  }
  return invoke("service_apikey_update_model", withAddr({
    keyId,
    modelSlug,
    reasoningEffort,
    protocolType: profile.protocolType || null,
    upstreamBaseUrl: profile.upstreamBaseUrl || null,
    staticHeadersJson: profile.staticHeadersJson || null,
  }));
}

export async function serviceApiKeyDelete(keyId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/delete", { id: keyId });
  }
  return invoke("service_apikey_delete", withAddr({ keyId }));
}

export async function serviceApiKeyDisable(keyId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/disable", { id: keyId });
  }
  return invoke("service_apikey_disable", withAddr({ keyId }));
}

export async function serviceApiKeyEnable(keyId) {
  if (!isTauriRuntime()) {
    return rpcInvoke("apikey/enable", { id: keyId });
  }
  return invoke("service_apikey_enable", withAddr({ keyId }));
}
