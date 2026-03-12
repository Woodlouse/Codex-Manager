import { state } from "../state.js";
import { fetchWithRetry, runWithControl } from "../utils/request.js";

export function isTauriRuntime() {
  const tauri = globalThis.window && window.__TAURI__;
  return Boolean(tauri && tauri.core && tauri.core.invoke);
}

export async function invoke(method, params, options = {}) {
  const tauri = globalThis.window && window.__TAURI__;
  if (!tauri || !tauri.core || !tauri.core.invoke) {
    throw new Error("桌面接口不可用（请在桌面端运行）");
  }
  const invokeOptions = options && typeof options === "object" ? options : {};
  const res = await runWithControl(
    () => tauri.core.invoke(method, params || {}),
    {
      signal: invokeOptions.signal,
      timeoutMs: invokeOptions.timeoutMs,
      retries: invokeOptions.retries,
      retryDelayMs: invokeOptions.retryDelayMs,
      maxRetryDelayMs: invokeOptions.maxRetryDelayMs,
      shouldRetry: invokeOptions.shouldRetry,
    },
  );
  if (res && typeof res === "object" && Object.prototype.hasOwnProperty.call(res, "error")) {
    const err = res.error;
    if (typeof err === "string" && err.trim()) {
      throw new Error(err);
    }
    if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
      throw new Error(err.message);
    }
    try {
      throw new Error(JSON.stringify(err));
    } catch {
      throw new Error("RPC 调用失败");
    }
  }

  const throwIfBusinessError = (payload) => {
    const msg = resolveBusinessErrorMessage(payload);
    if (msg) {
      throw new Error(msg);
    }
  };

  if (res && Object.prototype.hasOwnProperty.call(res, "result")) {
    const payload = res.result;
    throwIfBusinessError(payload);
    return payload;
  }
  throwIfBusinessError(res);
  return res;
}

export function isCommandMissingError(err) {
  const msg = String(err && err.message ? err.message : err).toLowerCase();
  if (
    msg.includes("not found")
    || msg.includes("unknown command")
    || msg.includes("no such command")
    || msg.includes("not managed")
    || msg.includes("does not exist")
  ) {
    return true;
  }
  return msg.includes("invalid args") && msg.includes("for command");
}

let rpcRequestId = 1;
let rpcTokenCache = "";

export async function rpcInvoke(method, params, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const signal = opts.signal;
  const timeoutMs = opts.timeoutMs == null ? 8000 : opts.timeoutMs;
  const retries = opts.retries == null ? 0 : opts.retries;
  const retryDelayMs = opts.retryDelayMs == null ? 180 : opts.retryDelayMs;
  const maxRetryDelayMs = opts.maxRetryDelayMs == null ? 1200 : opts.maxRetryDelayMs;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: rpcRequestId++,
    method,
    params: params == null ? undefined : params,
  });
  const response = await fetchWithRetry(
    "/api/rpc",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    },
    {
      signal,
      timeoutMs,
      retries,
      retryDelayMs,
      maxRetryDelayMs,
      shouldRetry: () => true,
      shouldRetryStatus: (status) => status === 429 || (status >= 500 && status < 600),
    },
  );
  if (!response.ok) {
    throw new Error(`RPC 请求失败（HTTP ${response.status}）`);
  }
  const payload = await response.json();
  const rpcError = unwrapRpcError(payload);
  if (rpcError) {
    throw new Error(rpcError);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, "result")) {
    const result = payload.result;
    const businessError = resolveBusinessErrorMessage(result);
    if (businessError) {
      throw new Error(businessError);
    }
    return result;
  }
  return payload;
}

function resolveRpcAddr() {
  const raw = String(state.serviceAddr || "").trim();
  if (raw) {
    const [host, port] = raw.split(":");
    if (port && (host === "0.0.0.0" || host === "127.0.0.1")) {
      return `localhost:${port}`;
    }
    return raw;
  }
  return "localhost:48760";
}

function unwrapRpcError(payload) {
  const err = payload && typeof payload === "object" ? payload.error : null;
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  return JSON.stringify(err);
}

function resolveBusinessErrorMessage(payload) {
  if (!payload || typeof payload !== "object") return "";
  const err = payload.error;
  if (payload.ok === false) {
    if (typeof err === "string" && err.trim()) {
      return err;
    }
    if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
      return err.message;
    }
    return "操作失败";
  }
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  return "";
}

async function getRpcToken(options = {}) {
  if (rpcTokenCache) {
    return rpcTokenCache;
  }
  const opts = options && typeof options === "object" ? options : {};
  const token = await invoke("service_rpc_token", {}, {
    signal: opts.signal,
    timeoutMs: opts.timeoutMs == null ? 2500 : opts.timeoutMs,
    retries: opts.retries,
    retryDelayMs: opts.retryDelayMs,
    maxRetryDelayMs: opts.maxRetryDelayMs,
    shouldRetry: opts.shouldRetry,
  });
  const normalized = String(token || "").trim();
  if (!normalized) {
    throw new Error("RPC 令牌不可用");
  }
  rpcTokenCache = normalized;
  return rpcTokenCache;
}

export function clearRpcTokenCache() {
  rpcTokenCache = "";
}

export async function requestlogListViaHttpRpc(query, limit, options = {}) {
  const signal = options && options.signal ? options.signal : undefined;
  const timeoutMs = options && Number.isFinite(options.timeoutMs) ? options.timeoutMs : 8000;
  const retries = options && Number.isFinite(options.retries) ? options.retries : 1;
  const retryDelayMs = options && Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 160;
  const addr = resolveRpcAddr();
  const token = await getRpcToken({
    signal,
    timeoutMs: Math.min(2500, timeoutMs),
  });
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: rpcRequestId++,
    method: "requestlog/list",
    params: { query, limit },
  });
  const response = await fetchWithRetry(
    `http://${addr}/rpc`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CodexManager-Rpc-Token": token,
      },
      body,
    },
    {
      signal,
      timeoutMs,
      retries,
      retryDelayMs,
      maxRetryDelayMs: 1200,
      shouldRetry: () => true,
      shouldRetryStatus: (status) => status === 429 || (status >= 500 && status < 600),
    },
  );
  if (!response.ok) {
    throw new Error(`RPC 请求失败（HTTP ${response.status}）`);
  }
  const payload = await response.json();
  const rpcError = unwrapRpcError(payload);
  if (rpcError) {
    throw new Error(rpcError);
  }
  if (payload && Object.prototype.hasOwnProperty.call(payload, "result")) {
    return payload.result;
  }
  return payload;
}

export async function invokeFirst(methods, params) {
  let lastErr = null;
  for (const method of methods) {
    try {
      return await invoke(method, params);
    } catch (err) {
      lastErr = err;
      if (!isCommandMissingError(err)) {
        throw err;
      }
    }
  }
  if (lastErr) {
    throw lastErr;
  }
  throw new Error("未配置可用命令");
}

export function withAddr(extra) {
  return {
    addr: state.serviceAddr || null,
    ...(extra || {}),
  };
}
