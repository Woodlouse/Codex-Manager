import { state } from "../../state.js";
import { dom } from "../../ui/dom.js";

let accountSelectAllBoundEl = null;
let accountSelectAllChangeHandler = null;
let getRenderedContext = () => ({ pageContext: { items: [] } });
let rerenderPage = () => {};

export function setSelectionContext({ getRenderedAccountsContext, rerenderAccountsPage } = {}) {
  getRenderedContext = typeof getRenderedAccountsContext === "function"
    ? getRenderedAccountsContext
    : () => ({ pageContext: { items: [] } });
  rerenderPage = typeof rerenderAccountsPage === "function" ? rerenderAccountsPage : () => {};
}

export function getSelectedAccountIdSet() {
  if (state.selectedAccountIds instanceof Set) {
    return state.selectedAccountIds;
  }
  const next = new Set(Array.isArray(state.selectedAccountIds) ? state.selectedAccountIds : []);
  state.selectedAccountIds = next;
  return next;
}

export function pruneSelectedAccountIds(accounts = state.accountList) {
  const selected = getSelectedAccountIdSet();
  if (selected.size === 0) {
    return;
  }
  const validIds = new Set(
    Array.from(accounts || [])
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean),
  );
  for (const accountId of Array.from(selected)) {
    if (!validIds.has(accountId)) {
      selected.delete(accountId);
    }
  }
}

export function isAccountSelected(accountId) {
  if (!accountId) return false;
  return getSelectedAccountIdSet().has(accountId);
}

export function setAccountSelected(accountId, selected) {
  const normalizedId = String(accountId || "").trim();
  if (!normalizedId) return false;
  const selectedIds = getSelectedAccountIdSet();
  const had = selectedIds.has(normalizedId);
  if (selected) {
    if (!had) {
      selectedIds.add(normalizedId);
      return true;
    }
    return false;
  }
  if (had) {
    selectedIds.delete(normalizedId);
    return true;
  }
  return false;
}

export function setPageSelection(accounts, selected) {
  let changed = false;
  for (const account of accounts || []) {
    changed = setAccountSelected(account?.id, selected) || changed;
  }
  return changed;
}

export function syncAccountSelectionControls(accounts) {
  const pageItems = Array.isArray(accounts) ? accounts : [];
  const selectedIds = getSelectedAccountIdSet();
  const currentPageIds = pageItems
    .map((item) => String(item?.id || "").trim())
    .filter(Boolean);
  let selectedOnPage = 0;
  for (const accountId of currentPageIds) {
    if (selectedIds.has(accountId)) {
      selectedOnPage += 1;
    }
  }

  if (dom.accountSelectAll) {
    const allSelected = currentPageIds.length > 0 && selectedOnPage === currentPageIds.length;
    dom.accountSelectAll.disabled = currentPageIds.length === 0;
    dom.accountSelectAll.checked = allSelected;
    dom.accountSelectAll.indeterminate =
      selectedOnPage > 0 && selectedOnPage < currentPageIds.length;
  }

  if (dom.deleteSelectedAccountsBtn) {
    const count = selectedIds.size;
    dom.deleteSelectedAccountsBtn.disabled = count === 0;
    dom.deleteSelectedAccountsBtn.textContent = count > 0
      ? `删除选中账号（${count}）`
      : "删除选中账号";
  }
}

export function ensureAccountSelectAllEventsBound() {
  if (!dom.accountSelectAll) {
    return;
  }
  if (!accountSelectAllChangeHandler) {
    accountSelectAllChangeHandler = (event) => {
      const nextSelected = Boolean(event?.target?.checked);
      const { pageContext } = getRenderedContext() || { pageContext: { items: [] } };
      const changed = setPageSelection(pageContext.items, nextSelected);
      syncAccountSelectionControls(pageContext.items);
      if (changed) {
        rerenderPage();
      }
    };
  }
  if (accountSelectAllBoundEl && accountSelectAllBoundEl !== dom.accountSelectAll) {
    accountSelectAllBoundEl.removeEventListener("change", accountSelectAllChangeHandler);
  }
  if (accountSelectAllBoundEl === dom.accountSelectAll) {
    return;
  }
  dom.accountSelectAll.addEventListener("change", accountSelectAllChangeHandler);
  accountSelectAllBoundEl = dom.accountSelectAll;
}
