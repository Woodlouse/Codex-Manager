import { dom } from "../../ui/dom.js";
import { formatLimitLabel, formatTs } from "../../utils/format.js";
import { normalizeGroupName } from "./state.js";
import { isAccountSelected, setAccountSelected, syncAccountSelectionControls } from "./selection-controller.js";

const ACCOUNT_ACTION_OPEN_USAGE = "open-usage";
const ACCOUNT_ACTION_SET_CURRENT = "set-current";
const ACCOUNT_ACTION_DELETE = "delete";
const ACCOUNT_FIELD_SELECT = "selected";

let accountRowsEventsBoundEl = null;
let accountRowsClickHandler = null;
let accountRowsChangeHandler = null;
let accountRowHandlers = null;
let accountLookupById = new Map();
let accountRowNodesById = new Map();
let getRenderedContext = () => ({ pageContext: { items: [] } });

export function setAccountRowsContext({ handlers, lookup, getRenderedAccountsContext } = {}) {
  accountRowHandlers = handlers || null;
  accountLookupById = lookup instanceof Map ? lookup : new Map();
  getRenderedContext = typeof getRenderedAccountsContext === "function"
    ? getRenderedAccountsContext
    : () => ({ pageContext: { items: [] } });
}

function renderMiniUsageLine(label, remain, secondary) {
  const line = document.createElement("div");
  line.className = "progress-line";
  if (secondary) line.classList.add("secondary");
  const text = document.createElement("span");
  text.textContent = `${label} ${remain == null ? "--" : `${remain}%`}`;
  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("div");
  fill.className = "fill";
  fill.style.width = remain == null ? "0%" : `${remain}%`;
  track.appendChild(fill);
  line.appendChild(text);
  line.appendChild(track);
  return line;
}

function createSelectCell(account) {
  const cellSelect = document.createElement("td");
  cellSelect.className = "account-col-select";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "account-select-checkbox";
  checkbox.setAttribute("data-field", ACCOUNT_FIELD_SELECT);
  checkbox.checked = isAccountSelected(account?.id);
  checkbox.setAttribute("aria-label", `选择账号 ${account?.label || account?.id || ""}`);
  cellSelect.appendChild(checkbox);
  return cellSelect;
}

function createStatusTag(status) {
  const statusTag = document.createElement("span");
  statusTag.className = "status-tag";
  statusTag.textContent = status.text;
  if (status.level === "ok") statusTag.classList.add("status-ok");
  if (status.level === "warn") statusTag.classList.add("status-warn");
  if (status.level === "bad") statusTag.classList.add("status-bad");
  if (status.level === "unknown") statusTag.classList.add("status-unknown");
  return statusTag;
}

function createAccountCell(account, accountDerived) {
  const cellAccount = document.createElement("td");
  cellAccount.className = "account-col-account";
  const accountWrap = document.createElement("div");
  accountWrap.className = "cell-stack";
  const primaryRemain = accountDerived?.primaryRemain ?? null;
  const secondaryRemain = accountDerived?.secondaryRemain ?? null;
  const accountTitle = document.createElement("strong");
  accountTitle.textContent = account.label || "-";
  const accountMeta = document.createElement("small");
  accountMeta.textContent = `${account.id || "-"}`;
  accountWrap.appendChild(accountTitle);
  accountWrap.appendChild(accountMeta);
  const mini = document.createElement("div");
  mini.className = "mini-usage";
  const usage = accountDerived?.usage || null;
  const hasPrimaryWindow = usage?.usedPercent != null && usage?.windowMinutes != null;
  const hasSecondaryWindow =
    usage?.secondaryUsedPercent != null
    || usage?.secondaryWindowMinutes != null;

  if (hasPrimaryWindow) {
    const primaryLabel = formatLimitLabel(usage?.windowMinutes, "5小时");
    mini.appendChild(
      renderMiniUsageLine(primaryLabel, primaryRemain, false),
    );
  }

  if (hasSecondaryWindow) {
    mini.appendChild(
      renderMiniUsageLine("7天", secondaryRemain, true),
    );
  }
  accountWrap.appendChild(mini);
  cellAccount.appendChild(accountWrap);
  return cellAccount;
}

function createGroupCell(account) {
  const cellGroup = document.createElement("td");
  cellGroup.className = "account-col-group";
  cellGroup.textContent = normalizeGroupName(account.groupName) || "-";
  return cellGroup;
}

function createSortCell(account) {
  const cellSort = document.createElement("td");
  cellSort.className = "account-col-sort";
  const sortInput = document.createElement("input");
  sortInput.className = "sort-input";
  sortInput.type = "number";
  sortInput.setAttribute("data-field", "sort");
  sortInput.value = account.sort != null ? String(account.sort) : "0";
  sortInput.dataset.originSort = sortInput.value;
  cellSort.appendChild(sortInput);
  return cellSort;
}

function createUpdatedCell(usage) {
  const cellUpdated = document.createElement("td");
  cellUpdated.className = "account-col-updated";
  const updatedText = document.createElement("strong");
  updatedText.textContent = usage && usage.capturedAt ? formatTs(usage.capturedAt) : "未知";
  cellUpdated.appendChild(updatedText);
  return cellUpdated;
}

function createActionsCell(isDeletable) {
  const cellActions = document.createElement("td");
  cellActions.className = "account-col-actions";
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "cell-actions";
  const btn = document.createElement("button");
  btn.className = "secondary";
  btn.type = "button";
  btn.setAttribute("data-action", ACCOUNT_ACTION_OPEN_USAGE);
  btn.textContent = "用量查询";
  actionsWrap.appendChild(btn);
  const setCurrent = document.createElement("button");
  setCurrent.className = "secondary";
  setCurrent.type = "button";
  setCurrent.setAttribute("data-action", ACCOUNT_ACTION_SET_CURRENT);
  setCurrent.textContent = "切到当前";
  actionsWrap.appendChild(setCurrent);

  if (isDeletable) {
    const del = document.createElement("button");
    del.className = "danger";
    del.type = "button";
    del.setAttribute("data-action", ACCOUNT_ACTION_DELETE);
    del.textContent = "删除";
    actionsWrap.appendChild(del);
  }
  cellActions.appendChild(actionsWrap);
  return cellActions;
}

function syncSetCurrentButton(actionsWrap, status) {
  if (!actionsWrap) return;
  const btn = actionsWrap.querySelector(`button[data-action="${ACCOUNT_ACTION_SET_CURRENT}"]`);
  if (!btn) return;
  const level = status?.level;
  const disabled = level === "warn" || level === "bad";
  btn.disabled = disabled;
  btn.title = disabled ? `账号当前不可用（${status?.text || "不可用"}），不参与网关选路` : "锁定为当前账号（异常前持续优先使用）";
}

export function renderEmptyRow(message) {
  const emptyRow = document.createElement("tr");
  const emptyCell = document.createElement("td");
  emptyCell.colSpan = 7;
  emptyCell.textContent = message;
  emptyRow.appendChild(emptyCell);
  dom.accountRows.appendChild(emptyRow);
}

function renderAccountRow(account, accountDerivedMap, { onDelete }) {
  const row = document.createElement("tr");
  row.setAttribute("data-account-id", account.id || "");
  const accountDerived = accountDerivedMap.get(account.id) || {
    usage: null,
    primaryRemain: null,
    secondaryRemain: null,
    status: { text: "未知", level: "unknown" },
  };

  row.appendChild(createSelectCell(account));
  row.appendChild(createAccountCell(account, accountDerived));
  row.appendChild(createGroupCell(account));
  row.appendChild(createSortCell(account));

  const cellStatus = document.createElement("td");
  cellStatus.className = "account-col-status";
  cellStatus.appendChild(createStatusTag(accountDerived.status));
  row.appendChild(cellStatus);

  row.appendChild(createUpdatedCell(accountDerived.usage));
  const actionsCell = createActionsCell(Boolean(onDelete));
  row.appendChild(actionsCell);
  syncSetCurrentButton(actionsCell.querySelector(".cell-actions"), accountDerived.status);
  return row;
}

export function removeAllAccountRows() {
  if (!dom.accountRows) return;
  while (dom.accountRows.firstElementChild) {
    dom.accountRows.firstElementChild.remove();
  }
  accountRowNodesById = new Map();
}

function updateStatusTag(node, status) {
  if (!node) return;
  const next = status || { text: "未知", level: "unknown" };
  node.textContent = next.text;
  node.className = "status-tag";
  if (next.level === "ok") node.classList.add("status-ok");
  if (next.level === "warn") node.classList.add("status-warn");
  if (next.level === "bad") node.classList.add("status-bad");
  if (next.level === "unknown") node.classList.add("status-unknown");
}

function updateMiniUsage(mini, usage, primaryRemain, secondaryRemain) {
  if (!mini) return;
  const safeUsage = usage || null;
  const hasPrimaryWindow = safeUsage?.usedPercent != null && safeUsage?.windowMinutes != null;
  const hasSecondaryWindow =
    safeUsage?.secondaryUsedPercent != null
    || safeUsage?.secondaryWindowMinutes != null;

  mini.textContent = "";
  if (hasPrimaryWindow) {
    const primaryLabel = formatLimitLabel(safeUsage?.windowMinutes, "5小时");
    mini.appendChild(renderMiniUsageLine(primaryLabel, primaryRemain ?? null, false));
  }
  if (hasSecondaryWindow) {
    mini.appendChild(renderMiniUsageLine("7天", secondaryRemain ?? null, true));
  }
}

function ensureDeleteButton(actionsWrap) {
  if (!actionsWrap) return null;
  const existing = actionsWrap.querySelector(`button[data-action="${ACCOUNT_ACTION_DELETE}"]`);
  if (existing) return existing;
  const del = document.createElement("button");
  del.className = "danger";
  del.type = "button";
  del.setAttribute("data-action", ACCOUNT_ACTION_DELETE);
  del.textContent = "删除";
  actionsWrap.appendChild(del);
  return del;
}

function syncDeleteButton(actionsWrap, enabled) {
  if (!actionsWrap) return;
  const existing = actionsWrap.querySelector(`button[data-action="${ACCOUNT_ACTION_DELETE}"]`);
  if (enabled) {
    ensureDeleteButton(actionsWrap);
    return;
  }
  existing?.remove();
}

function updateAccountRow(row, account, accountDerivedMap, { onDelete }) {
  if (!row || !account || !account.id) {
    return row;
  }
  row.setAttribute("data-account-id", account.id);
  const accountDerived = accountDerivedMap.get(account.id) || {
    usage: null,
    primaryRemain: null,
    secondaryRemain: null,
    status: { text: "未知", level: "unknown" },
  };

  const selectInput = row.querySelector?.(`input[data-field='${ACCOUNT_FIELD_SELECT}']`);
  if (selectInput) {
    selectInput.checked = isAccountSelected(account.id);
  }

  const cellAccount = row.querySelector?.(".account-col-account");
  const title = cellAccount?.querySelector?.("strong");
  const meta = cellAccount?.querySelector?.("small");
  if (title) title.textContent = account.label || "-";
  if (meta) meta.textContent = `${account.id || "-"}`;
  const mini = cellAccount?.querySelector?.(".mini-usage");
  updateMiniUsage(mini, accountDerived.usage, accountDerived.primaryRemain, accountDerived.secondaryRemain);

  const cellGroup = row.querySelector?.(".account-col-group");
  if (cellGroup) cellGroup.textContent = normalizeGroupName(account.groupName) || "-";

  const sortCell = row.querySelector?.(".account-col-sort");
  const sortInput = sortCell?.querySelector?.("input[data-field='sort']");
  if (sortInput) {
    const next = account.sort != null ? String(account.sort) : "0";
    if (document.activeElement !== sortInput) {
      sortInput.value = next;
      sortInput.dataset.originSort = next;
    }
  }

  const statusCell = row.querySelector?.(".account-col-status");
  const statusTag = statusCell?.querySelector?.(".status-tag");
  updateStatusTag(statusTag, accountDerived.status);

  const updatedCell = row.querySelector?.(".account-col-updated");
  const updatedStrong = updatedCell?.querySelector?.("strong");
  if (updatedStrong) {
    updatedStrong.textContent = accountDerived.usage && accountDerived.usage.capturedAt
      ? formatTs(accountDerived.usage.capturedAt)
      : "未知";
  }

  const actionsCell = row.querySelector?.(".account-col-actions");
  const actionsWrap = actionsCell?.querySelector?.(".cell-actions");
  syncDeleteButton(actionsWrap, Boolean(onDelete));
  syncSetCurrentButton(actionsWrap, accountDerived.status);
  return row;
}

export function syncAccountRows(filtered, accountDerivedMap, { onDelete }) {
  if (!dom.accountRows) return;
  const nextIds = new Set(filtered.map((account) => account.id));

  // Remove stale cache entries (and DOM nodes if still present)
  for (const [accountId, cachedRow] of accountRowNodesById.entries()) {
    if (!nextIds.has(accountId)) {
      cachedRow?.remove?.();
      accountRowNodesById.delete(accountId);
    }
  }

  let cursor = dom.accountRows.firstElementChild;
  for (const account of filtered) {
    if (!account || !account.id) continue;
    const accountId = account.id;
    let row = accountRowNodesById.get(accountId);
    if (!row || !row.isConnected) {
      row = renderAccountRow(account, accountDerivedMap, { onDelete });
      accountRowNodesById.set(accountId, row);
    } else {
      updateAccountRow(row, account, accountDerivedMap, { onDelete });
    }

    if (row === cursor) {
      cursor = cursor?.nextElementSibling || null;
      continue;
    }
    dom.accountRows.insertBefore(row, cursor);
  }

  // Remove any leftover nodes (including previous empty row) after the cursor.
  while (cursor) {
    const next = cursor.nextElementSibling;
    const accountId = cursor?.dataset?.accountId || "";
    if (!accountId || !nextIds.has(accountId)) {
      cursor.remove();
    }
    cursor = next;
  }

  syncAccountSelectionControls(filtered);
}

function getAccountFromRow(row, lookup) {
  const accountId = row?.dataset?.accountId;
  if (!accountId) return null;
  return lookup.get(accountId) || null;
}

export function handleAccountRowsClick(target, handlers = accountRowHandlers, lookup = accountLookupById) {
  const actionButton = target?.closest?.("button[data-action]");
  if (!actionButton) return false;
  const row = actionButton.closest("tr[data-account-id]");
  if (!row) return false;
  const account = getAccountFromRow(row, lookup);
  if (!account) return false;
  const action = actionButton.dataset.action;
  if (action === ACCOUNT_ACTION_OPEN_USAGE) {
    handlers?.onOpenUsage?.(account);
    return true;
  }
  if (action === ACCOUNT_ACTION_SET_CURRENT) {
    handlers?.onSetCurrentAccount?.(account);
    return true;
  }
  if (action === ACCOUNT_ACTION_DELETE) {
    handlers?.onDelete?.(account);
    return true;
  }
  return false;
}

export function handleAccountRowsChange(target, handlers = accountRowHandlers) {
  const selectInput = target?.closest?.(`input[data-field='${ACCOUNT_FIELD_SELECT}']`);
  if (selectInput) {
    const row = selectInput.closest("tr[data-account-id]");
    if (!row) return false;
    const accountId = row.dataset.accountId;
    if (!accountId) return false;
    const changed = setAccountSelected(accountId, Boolean(selectInput.checked));
    const { pageContext } = getRenderedContext() || { pageContext: { items: [] } };
    syncAccountSelectionControls(pageContext.items);
    return changed;
  }
  const sortInput = target?.closest?.("input[data-field='sort']");
  if (!sortInput) return false;
  const row = sortInput.closest("tr[data-account-id]");
  if (!row) return false;
  const accountId = row.dataset.accountId;
  if (!accountId) return false;
  const sortValue = Number(sortInput.value || 0);
  const originSort = Number(sortInput.dataset.originSort);
  if (Number.isFinite(originSort) && originSort === sortValue) {
    return false;
  }
  sortInput.dataset.originSort = String(sortValue);
  handlers?.onUpdateSort?.(accountId, sortValue, originSort);
  return true;
}

export function ensureAccountRowsEventsBound() {
  if (!dom.accountRows) {
    return;
  }
  if (!accountRowsClickHandler) {
    accountRowsClickHandler = (event) => {
      handleAccountRowsClick(event.target);
    };
  }
  if (!accountRowsChangeHandler) {
    accountRowsChangeHandler = (event) => {
      handleAccountRowsChange(event.target);
    };
  }
  if (accountRowsEventsBoundEl && accountRowsEventsBoundEl !== dom.accountRows) {
    accountRowsEventsBoundEl.removeEventListener("click", accountRowsClickHandler);
    accountRowsEventsBoundEl.removeEventListener("change", accountRowsChangeHandler);
  }
  if (accountRowsEventsBoundEl === dom.accountRows) {
    return;
  }
  dom.accountRows.addEventListener("click", accountRowsClickHandler);
  dom.accountRows.addEventListener("change", accountRowsChangeHandler);
  accountRowsEventsBoundEl = dom.accountRows;
}
