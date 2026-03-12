export function fallbackAccountNameFromId(accountId) {
  const raw = String(accountId || "").trim();
  if (!raw) return "";
  const sep = raw.indexOf("::");
  if (sep < 0) return "";
  return raw.slice(sep + 2).trim();
}

export function fallbackAccountDisplayFromKey(keyId) {
  const raw = String(keyId || "").trim();
  if (!raw) return "";
  const compact = raw.slice(0, 10);
  return `Key ${compact}`;
}

export function ensureAccountLabelMap(accountList, windowState) {
  const list = Array.isArray(accountList) ? accountList : [];
  if (windowState.accountListRef === list) {
    return windowState.accountLabelById;
  }
  const map = new Map();
  for (let i = 0; i < list.length; i += 1) {
    const account = list[i];
    const id = account?.id;
    const label = account?.label;
    if (id && label) {
      map.set(id, label);
    }
  }
  windowState.accountListRef = list;
  windowState.accountLabelById = map;
  return map;
}

export function resolveAccountDisplayName(item, accountLabelById) {
  const accountId = item?.accountId || item?.account?.id || "";
  const directLabel = item?.accountLabel || item?.account?.label || "";
  if (directLabel) return directLabel;
  if (accountId) {
    const label = accountLabelById?.get(accountId);
    if (label) {
      return label;
    }
  }
  return fallbackAccountNameFromId(accountId);
}

export function resolveDisplayRequestPath(item) {
  const originalPath = String(item?.originalPath || "").trim();
  if (originalPath) {
    return originalPath;
  }
  return String(item?.requestPath || "").trim();
}

export function buildRequestRouteMeta(item, displayPath) {
  const parts = [];
  const adaptedPath = String(item?.adaptedPath || "").trim();
  const responseAdapter = String(item?.responseAdapter || "").trim();
  const upstreamUrl = String(item?.upstreamUrl || "").trim();
  if (adaptedPath && adaptedPath !== displayPath) {
    parts.push(`转发 ${adaptedPath}`);
  }
  if (responseAdapter) {
    parts.push(`适配 ${responseAdapter}`);
  }
  if (upstreamUrl) {
    parts.push(`上游 ${upstreamUrl}`);
  }
  return parts;
}

export function matchesStatusFilter(item, filter) {
  if (filter === "all") return true;
  const code = Number(item.statusCode);
  if (!Number.isFinite(code)) return false;
  if (filter === "2xx") return code >= 200 && code < 300;
  if (filter === "4xx") return code >= 400 && code < 500;
  if (filter === "5xx") return code >= 500 && code < 600;
  return true;
}

export function buildRequestLogIdentity(item, fallbackIndex) {
  const precomputed = item && typeof item === "object" ? item.__identity : null;
  if (precomputed != null && String(precomputed).trim()) {
    return String(precomputed);
  }
  if (item && typeof item === "object" && item.id != null && String(item.id).trim()) {
    return String(item.id);
  }
  // 中文注释：identity 用于“增量追加”判断，避免把 error/path 等长字段拼进 key 导致大量分配与 GC。
  return [
    item?.createdAt ?? "",
    item?.method ?? "",
    item?.statusCode ?? "",
    item?.accountId ?? "",
    item?.keyId ?? "",
    fallbackIndex,
  ].join("|");
}

export function collectFilteredRequestLogs(requestLogList, filter) {
  const list = Array.isArray(requestLogList) ? requestLogList : [];
  const filtered = [];
  const filteredKeys = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!matchesStatusFilter(item, filter)) {
      continue;
    }
    filtered.push(item);
    filteredKeys.push(buildRequestLogIdentity(item, i));
  }
  return { filter, filtered, filteredKeys };
}

export function isAppendOnlyResult(prevKeys, nextKeys) {
  if (!Array.isArray(prevKeys) || !Array.isArray(nextKeys)) return false;
  if (prevKeys.length > nextKeys.length) return false;
  for (let i = 0; i < prevKeys.length; i += 1) {
    if (prevKeys[i] !== nextKeys[i]) {
      return false;
    }
  }
  return true;
}
