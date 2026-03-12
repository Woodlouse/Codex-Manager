import { state } from "../../state.js";
import { dom } from "../../ui/dom.js";
import { getRefreshAllProgress } from "../../services/management/account-actions.js";
import { buildGroupFilterOptions } from "./state.js";

let groupOptionsAccountsRef = null;
let groupOptionsCache = [];
let groupSelectRenderedKey = null;
let refreshProgressNode = null;

function ensureRefreshProgressNode() {
  if (refreshProgressNode?.isConnected) {
    return refreshProgressNode;
  }
  if (!dom.accountsToolbar) {
    return null;
  }
  const existing = dom.accountsToolbar.querySelector(".accounts-refresh-progress");
  if (existing) {
    refreshProgressNode = existing;
    return refreshProgressNode;
  }
  const node = document.createElement("div");
  node.className = "accounts-refresh-progress";
  node.hidden = true;
  node.setAttribute("aria-live", "polite");
  dom.accountsToolbar.prepend(node);
  refreshProgressNode = node;
  return refreshProgressNode;
}

export function renderAccountsRefreshProgress(progress = getRefreshAllProgress()) {
  const node = ensureRefreshProgressNode();
  if (!node) return;
  const total = Math.max(0, Number(progress?.total || 0));
  const completed = Math.min(total, Math.max(0, Number(progress?.completed || 0)));
  const remaining = Math.max(0, Number(progress?.remaining ?? total - completed));
  const active = Boolean(progress?.active) && Boolean(progress?.manual) && total > 0;
  if (!active) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  const primaryText = `刷新进度 ${completed}/${total}，剩余 ${remaining} 项`;
  const lastTaskLabel = String(progress?.lastTaskLabel || "").trim();
  node.hidden = false;
  node.textContent = lastTaskLabel ? `${primaryText} · 最近完成：${lastTaskLabel}` : primaryText;
}

function getGroupOptions(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (groupOptionsAccountsRef !== accounts) {
    groupOptionsAccountsRef = accounts;
    groupOptionsCache = buildGroupFilterOptions(list);
  } else if (Array.isArray(groupOptionsCache) && groupOptionsCache.length > 0) {
    // 保持“全部分组”计数与当前账号数量一致。
    groupOptionsCache[0] = {
      ...groupOptionsCache[0],
      count: list.length,
    };
  }
  return groupOptionsCache;
}

function syncGroupFilterSelect(options, optionsKey) {
  if (!dom.accountGroupFilter) return;
  const select = dom.accountGroupFilter;
  const safeOptions = Array.isArray(options) ? options : [];
  const nextValues = new Set(safeOptions.map((item) => item.value));

  // 中文注释：分组来自实时账号数据；若分组被删除/重命名，不自动回退会导致列表“看似空白”且用户难定位原因。
  if (!nextValues.has(state.accountGroupFilter)) {
    state.accountGroupFilter = "all";
  }

  if (groupSelectRenderedKey === optionsKey && select.children.length === safeOptions.length) {
    if (select.value !== state.accountGroupFilter) {
      select.value = state.accountGroupFilter;
    }
    return;
  }

  select.innerHTML = "";
  for (const option of safeOptions) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = `${option.label} (${option.count})`;
    if (option.value === state.accountGroupFilter) {
      node.selected = true;
    }
    select.appendChild(node);
  }
  groupSelectRenderedKey = optionsKey;
  if (!nextValues.has(state.accountGroupFilter)) {
    select.value = "all";
  }
}

export function syncAccountGroupFilter(accounts = state.accountList) {
  const options = getGroupOptions(accounts);
  syncGroupFilterSelect(options, accounts);
}
