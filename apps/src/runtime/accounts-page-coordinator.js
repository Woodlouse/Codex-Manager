import { renderAccountsOnly, renderAllViews, renderCurrentView } from "../views/renderers";
import { buildRenderActions } from "../views/render-actions";

export function createAccountsPageCoordinator({
  state,
  ensureConnected,
  refreshAccountsPage,
  renderAccountsRefreshProgress,
  setRefreshAllProgress,
  clearRefreshAllProgress,
  showToast,
  normalizeErrorMessage,
  updateServiceToggle,
  updateAccountSort,
  handleOpenUsageModal,
  setManualPreferredAccount,
  deleteAccount,
  toggleApiKeyStatus,
  deleteApiKey,
  updateApiKeyModel,
  copyApiKey,
}) {
  function buildMainRenderActions() {
    return buildRenderActions({
      updateAccountSort,
      handleOpenUsageModal,
      setManualPreferredAccount,
      deleteAccount,
      refreshAccountsPage: () => reloadAccountsPage({ latestOnly: true, silent: false }),
      toggleApiKeyStatus,
      deleteApiKey,
      updateApiKeyModel,
      copyApiKey,
    });
  }

  function renderCurrentPageView(page = state.currentPage) {
    renderCurrentView(page, buildMainRenderActions());
  }

  function renderAccountsView() {
    renderAccountsOnly(buildMainRenderActions());
  }

  function renderAllPageViews() {
    renderAllViews(buildMainRenderActions());
  }

  async function reloadAccountsPage(options = {}) {
    const silent = options.silent === true;
    const render = options.render !== false;
    const ensureConnection = options.ensureConnection !== false;

    if (ensureConnection) {
      const ok = await ensureConnected();
      updateServiceToggle?.();
      if (!ok) {
        return false;
      }
    }

    try {
      const applied = await refreshAccountsPage({ latestOnly: options.latestOnly !== false });
      if (applied !== false && render) {
        renderAccountsView();
      }
      return applied !== false;
    } catch (err) {
      console.error("[accounts] page refresh failed", err);
      if (!silent) {
        showToast(`账号分页刷新失败：${normalizeErrorMessage(err)}`, "error");
      }
      return false;
    }
  }

  return {
    buildMainRenderActions,
    clearRefreshAllProgress,
    reloadAccountsPage,
    renderAccountsRefreshProgress,
    renderAccountsView,
    renderAllPageViews,
    renderCurrentPageView,
    setRefreshAllProgress,
  };
}
