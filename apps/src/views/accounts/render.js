import { state } from "../../state.js";
import {
  buildAccountDerivedMap,
  filterAccounts,
} from "./state.js";
import {
  renderAccountsRefreshProgress,
  syncAccountGroupFilter,
} from "./toolbar-render.js";
import {
  ensureAccountSelectAllEventsBound,
  pruneSelectedAccountIds,
  setSelectionContext,
  syncAccountSelectionControls,
} from "./selection-controller.js";
import {
  getAccountPageContext,
  getRemoteAccountPageContext,
  renderAccountPagination,
  setPaginationContext,
} from "./pagination-render.js";
import {
  ensureAccountRowsEventsBound,
  handleAccountRowsChange,
  handleAccountRowsClick,
  removeAllAccountRows,
  renderEmptyRow,
  setAccountRowsContext,
  syncAccountRows,
} from "./table-rows.js";

let derivedCacheAccountsRef = null;
let derivedCacheUsageRef = null;
let derivedCacheMap = new Map();

function getAccountDerivedMapCached(accounts, usageSource) {
  if (derivedCacheAccountsRef === accounts && derivedCacheUsageRef === usageSource) {
    return derivedCacheMap;
  }
  derivedCacheAccountsRef = accounts;
  derivedCacheUsageRef = usageSource;
  derivedCacheMap = buildAccountDerivedMap(accounts, usageSource);
  return derivedCacheMap;
}

function getRenderedAccountsContext() {
  const usingRemotePagination = state.accountPageLoaded === true;
  const sourceAccounts = usingRemotePagination ? state.accountPageItems : state.accountList;
  const accountDerivedMap = getAccountDerivedMapCached(sourceAccounts, state.usageList);
  const pageContext = usingRemotePagination
    ? getRemoteAccountPageContext(state.accountPageItems, state.accountPageTotal)
    : getAccountPageContext(filterAccounts(
      state.accountList,
      accountDerivedMap,
      state.accountSearch,
      state.accountFilter,
      state.accountGroupFilter,
    ));
  return {
    usingRemotePagination,
    sourceAccounts,
    accountDerivedMap,
    pageContext,
  };
}

function rerenderAccountsPage() {
  renderAccounts(currentHandlers);
}

function requestAccountsPageReload() {
  if (typeof currentHandlers?.onRefreshPage === "function") {
    void currentHandlers.onRefreshPage();
    return;
  }
  rerenderAccountsPage();
}

let currentHandlers = null;

export { handleAccountRowsClick, handleAccountRowsChange, renderAccountsRefreshProgress };

// 渲染账号列表
export function renderAccounts({
  onUpdateSort,
  onOpenUsage,
  onSetCurrentAccount,
  onDelete,
  onRefreshPage,
}) {
  currentHandlers = { onUpdateSort, onOpenUsage, onSetCurrentAccount, onDelete, onRefreshPage };
  setSelectionContext({ getRenderedAccountsContext, rerenderAccountsPage });
  setPaginationContext({ requestAccountsPageReload });
  ensureAccountRowsEventsBound();
  ensureAccountSelectAllEventsBound();
  renderAccountsRefreshProgress();
  syncAccountGroupFilter(state.accountList);
  if (state.accountList.length > 0) {
    pruneSelectedAccountIds(state.accountList);
  }
  const { pageContext, accountDerivedMap } = getRenderedAccountsContext();
  renderAccountPagination(pageContext);

  if (pageContext.total === 0) {
    setAccountRowsContext({
      handlers: currentHandlers,
      lookup: new Map(),
      getRenderedAccountsContext,
    });
    syncAccountSelectionControls([]);
    const hasAccounts = state.accountList.length > 0;
    const message = hasAccounts ? "当前筛选条件下无结果" : "暂无账号";
    removeAllAccountRows();
    renderEmptyRow(message);
    return;
  }

  setAccountRowsContext({
    handlers: currentHandlers,
    lookup: new Map(pageContext.items.map((account) => [account.id, account])),
    getRenderedAccountsContext,
  });
  syncAccountRows(pageContext.items, accountDerivedMap, { onDelete });
}
