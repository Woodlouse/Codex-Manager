import { state } from "../../state.js";
import { dom } from "../../ui/dom.js";

const ACCOUNT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 80, 120, 500];
const DEFAULT_ACCOUNT_PAGE_SIZE = 5;

let accountPaginationBoundRefs = null;
let accountPageSizeChangeHandler = null;
let accountPagePrevClickHandler = null;
let accountPageNextClickHandler = null;
let requestAccountsPageReloadFn = null;

export function setPaginationContext({ requestAccountsPageReload } = {}) {
  requestAccountsPageReloadFn = typeof requestAccountsPageReload === "function"
    ? requestAccountsPageReload
    : null;
}

function normalizeAccountPageSize(value) {
  const parsed = Number(value);
  if (ACCOUNT_PAGE_SIZE_OPTIONS.includes(parsed)) {
    return parsed;
  }
  return DEFAULT_ACCOUNT_PAGE_SIZE;
}

function clampAccountPage(page, totalPages) {
  const normalized = Number(page);
  if (!Number.isFinite(normalized) || normalized < 1) {
    return 1;
  }
  return Math.min(Math.trunc(normalized), Math.max(1, totalPages));
}

export function getAccountPageContext(filtered) {
  const total = Array.isArray(filtered) ? filtered.length : 0;
  const pageSize = normalizeAccountPageSize(state.accountPageSize);
  state.accountPageSize = pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = clampAccountPage(state.accountPage, totalPages);
  state.accountPage = page;
  const startIndex = total > 0 ? (page - 1) * pageSize : 0;
  const endIndex = total > 0 ? Math.min(startIndex + pageSize, total) : 0;
  return {
    total,
    pageSize,
    totalPages,
    page,
    startIndex,
    endIndex,
    items: total > 0 ? filtered.slice(startIndex, endIndex) : [],
  };
}

function ensureAccountPaginationEventsBound() {
  if (!dom.accountPageSize || !dom.accountPagePrev || !dom.accountPageNext) {
    return;
  }
  const nextRefs = {
    pageSize: dom.accountPageSize,
    prev: dom.accountPagePrev,
    next: dom.accountPageNext,
  };
  if (
    accountPaginationBoundRefs
    && accountPaginationBoundRefs.pageSize === nextRefs.pageSize
    && accountPaginationBoundRefs.prev === nextRefs.prev
    && accountPaginationBoundRefs.next === nextRefs.next
  ) {
    return;
  }
  if (!accountPageSizeChangeHandler) {
    accountPageSizeChangeHandler = (event) => {
      const nextPageSize = normalizeAccountPageSize(event.target?.value);
      if (nextPageSize === state.accountPageSize && state.accountPage === 1) {
        return;
      }
      state.accountPageSize = nextPageSize;
      state.accountPage = 1;
      requestAccountsPageReloadFn?.();
    };
  }
  if (!accountPagePrevClickHandler) {
    accountPagePrevClickHandler = () => {
      if (state.accountPage <= 1) {
        return;
      }
      state.accountPage -= 1;
      requestAccountsPageReloadFn?.();
    };
  }
  if (!accountPageNextClickHandler) {
    accountPageNextClickHandler = () => {
      state.accountPage += 1;
      requestAccountsPageReloadFn?.();
    };
  }
  if (accountPaginationBoundRefs) {
    accountPaginationBoundRefs.pageSize?.removeEventListener("change", accountPageSizeChangeHandler);
    accountPaginationBoundRefs.prev?.removeEventListener("click", accountPagePrevClickHandler);
    accountPaginationBoundRefs.next?.removeEventListener("click", accountPageNextClickHandler);
  }
  nextRefs.pageSize.addEventListener("change", accountPageSizeChangeHandler);
  nextRefs.prev.addEventListener("click", accountPagePrevClickHandler);
  nextRefs.next.addEventListener("click", accountPageNextClickHandler);
  accountPaginationBoundRefs = nextRefs;
}

export function renderAccountPagination(pageContext) {
  ensureAccountPaginationEventsBound();
  if (
    !dom.accountPagination
    || !dom.accountPaginationSummary
    || !dom.accountPageSize
    || !dom.accountPagePrev
    || !dom.accountPageInfo
    || !dom.accountPageNext
  ) {
    return;
  }
  const {
    total,
    pageSize,
    totalPages,
    page,
    startIndex,
    endIndex,
  } = pageContext;
  dom.accountPagination.hidden = false;
  dom.accountPageSize.value = String(pageSize);
  if (total <= 0) {
    dom.accountPaginationSummary.textContent = "共 0 个账号";
  } else {
    dom.accountPaginationSummary.textContent = `共 ${total} 个账号，当前显示 ${startIndex + 1}-${endIndex}`;
  }
  dom.accountPageInfo.textContent = `第 ${page} / ${totalPages} 页`;
  dom.accountPagePrev.disabled = total <= 0 || page <= 1;
  dom.accountPageNext.disabled = total <= 0 || page >= totalPages;
}

export function getRemoteAccountPageContext(items, total) {
  const safeItems = Array.isArray(items) ? items : [];
  const normalizedTotal = Math.max(0, Number(total || 0));
  const pageSize = normalizeAccountPageSize(state.accountPageSize);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = clampAccountPage(state.accountPage, totalPages);
  state.accountPage = page;
  state.accountPageSize = pageSize;
  const startIndex = normalizedTotal > 0 ? (page - 1) * pageSize : 0;
  const endIndex = normalizedTotal > 0 ? startIndex + safeItems.length : 0;
  return {
    total: normalizedTotal,
    pageSize,
    totalPages,
    page,
    startIndex,
    endIndex,
    items: safeItems,
  };
}
