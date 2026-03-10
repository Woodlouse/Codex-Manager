import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/responsive.css";
import "./styles/performance.css";

import {
  appSettingsGet,
  appSettingsSet,
  serviceGatewayBackgroundTasksSet,
  serviceGatewayHeaderPolicySet,
  serviceGatewayUpstreamProxySet,
  serviceGatewayRouteStrategySet,
  serviceUsageRefresh,
  updateCheck,
  updateDownload,
  updateInstall,
  updateRestart,
  updateStatus,
} from "./api";
import { state } from "./state";
import { dom } from "./ui/dom";
import { setStatus, setServiceHint } from "./ui/status";
import { createFeedbackHandlers } from "./ui/feedback";
import { createThemeController } from "./ui/theme";
import {
  buildEnvOverrideDescription,
  buildEnvOverrideOptionLabel,
  filterEnvOverrideCatalog,
  formatEnvOverrideDisplayValue,
  normalizeEnvOverrideCatalog,
  normalizeEnvOverrides,
  normalizeStringList,
} from "./ui/env-overrides";
import { withButtonBusy } from "./ui/button-busy";
import { createStartupMaskController } from "./ui/startup-mask";
import { normalizeUpstreamProxyUrl } from "./utils/upstream-proxy.js";
import {
  ensureConnected,
  normalizeAddr,
  startService,
  stopService,
  waitForConnection,
} from "./services/connection";
import {
  refreshAccounts,
  refreshAccountsPage,
  refreshUsageList,
  refreshApiKeys,
  refreshApiModels,
  refreshRequestLogs,
  refreshRequestLogTodaySummary,
  clearRequestLogs,
} from "./services/data";
import {
  ensureAutoRefreshTimer,
  runRefreshTasks,
  stopAutoRefreshTimer,
} from "./services/refresh";
import { createServiceLifecycle } from "./services/service-lifecycle";
import { createLoginFlow } from "./services/login-flow";
import { createManagementActions } from "./services/management-actions";
import { createUpdateController } from "./services/update-controller.js";
import { openAccountModal, closeAccountModal } from "./views/accounts";
import { renderAccountsRefreshProgress } from "./views/accounts/render";
import {
  clearRefreshAllProgress,
  setRefreshAllProgress,
} from "./services/management/account-actions";
import { renderApiKeys, openApiKeyModal, closeApiKeyModal, populateApiKeyModelSelect } from "./views/apikeys";
import { openUsageModal, closeUsageModal, renderUsageSnapshot } from "./views/usage";
import { renderRequestLogs } from "./views/requestlogs";
import { renderAccountsOnly, renderCurrentView } from "./views/renderers";
import { buildRenderActions } from "./views/render-actions";
import { createNavigationHandlers } from "./views/navigation";
import { bindMainEvents } from "./views/event-bindings";
import { bindSettingsEvents } from "./settings/bind-settings-events.js";
import { createSettingsController } from "./settings/controller.js";
import { createSettingsServiceSync } from "./settings/service-sync.js";

const { showToast, showConfirmDialog } = createFeedbackHandlers({ dom });
let settingsController = null;
let settingsServiceSync = null;

function saveAppSettingsPatch(patch = {}) {
  if (!settingsController) {
    throw new Error("settings controller is not ready");
  }
  return settingsController.saveAppSettingsPatch(patch);
}

const {
  renderThemeButtons,
  setTheme,
  restoreTheme,
  closeThemePanel,
  toggleThemePanel,
} = createThemeController({
  dom,
  onThemeChange: (theme) => saveAppSettingsPatch({ theme }),
});

function renderCurrentPageView(page = state.currentPage) {
  renderCurrentView(page, buildMainRenderActions());
}

async function reloadAccountsPage(options = {}) {
  const silent = options.silent === true;
  const render = options.render !== false;
  const ensureConnection = options.ensureConnection !== false;

  if (ensureConnection) {
    const ok = await ensureConnected();
    serviceLifecycle.updateServiceToggle();
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

const { switchPage, updateRequestLogFilterButtons } = createNavigationHandlers({
  state,
  dom,
  closeThemePanel,
  onPageActivated: (page) => {
    renderCurrentPageView(page);
    if (page === "accounts") {
      void reloadAccountsPage({ silent: true, latestOnly: true });
    }
  },
});

const { setStartupMask } = createStartupMaskController({ dom, state });
const API_MODELS_REMOTE_REFRESH_STORAGE_KEY = "codexmanager.apikey.models.last_remote_refresh_at";
const API_MODELS_REMOTE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_CHECK_DELAY_MS = 1200;
let refreshAllInFlight = null;
let refreshAllProgressClearTimer = null;
let apiModelsRemoteRefreshInFlight = null;

function isTauriRuntime() {
  return Boolean(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
}

settingsController = createSettingsController({
  dom,
  state,
  appSettingsGet,
  appSettingsSet,
  showToast,
  normalizeErrorMessage,
  isTauriRuntime,
  normalizeAddr,
  normalizeUpstreamProxyUrl,
  buildEnvOverrideDescription,
  buildEnvOverrideOptionLabel,
  filterEnvOverrideCatalog,
  formatEnvOverrideDisplayValue,
  normalizeEnvOverrideCatalog,
  normalizeEnvOverrides,
  normalizeStringList,
});

const {
  loadAppSettings,
  getAppSettingsSnapshot,
  applyBrowserModeUi,
  readUpdateAutoCheckSetting,
  saveUpdateAutoCheckSetting,
  initUpdateAutoCheckSetting,
  readCloseToTrayOnCloseSetting,
  saveCloseToTrayOnCloseSetting,
  setCloseToTrayOnCloseToggle,
  applyCloseToTrayOnCloseSetting,
  initCloseToTrayOnCloseSetting,
  readLightweightModeOnCloseToTraySetting,
  saveLightweightModeOnCloseToTraySetting,
  setLightweightModeOnCloseToTrayToggle,
  syncLightweightModeOnCloseToTrayAvailability,
  applyLightweightModeOnCloseToTraySetting,
  initLightweightModeOnCloseToTraySetting,
  readLowTransparencySetting,
  saveLowTransparencySetting,
  applyLowTransparencySetting,
  initLowTransparencySetting,
  normalizeServiceListenMode,
  serviceListenModeLabel,
  buildServiceListenModeHint,
  setServiceListenModeSelect,
  setServiceListenModeHint,
  readServiceListenModeSetting,
  initServiceListenModeSetting,
  applyServiceListenModeToService,
  syncServiceListenModeOnStartup,
  normalizeRouteStrategy,
  routeStrategyLabel,
  readRouteStrategySetting,
  saveRouteStrategySetting,
  setRouteStrategySelect,
  initRouteStrategySetting,
  normalizeCpaNoCookieHeaderMode,
  readCpaNoCookieHeaderModeSetting,
  saveCpaNoCookieHeaderModeSetting,
  setCpaNoCookieHeaderModeToggle,
  initCpaNoCookieHeaderModeSetting,
  readUpstreamProxyUrlSetting,
  saveUpstreamProxyUrlSetting,
  setUpstreamProxyInput,
  setUpstreamProxyHint,
  initUpstreamProxySetting,
  normalizeBackgroundTasksSettings,
  readBackgroundTasksSetting,
  saveBackgroundTasksSetting,
  setBackgroundTasksForm,
  readBackgroundTasksForm,
  updateBackgroundTasksHint,
  initBackgroundTasksSetting,
  getEnvOverrideSelectedKey,
  findEnvOverrideCatalogItem,
  setEnvOverridesHint,
  readEnvOverridesSetting,
  buildEnvOverrideHint,
  saveEnvOverridesSetting,
  renderEnvOverrideEditor,
  initEnvOverridesSetting,
  updateWebAccessPasswordState,
  syncWebAccessPasswordInputs,
  saveWebAccessPassword,
  clearWebAccessPassword,
  openWebSecurityModal,
  closeWebSecurityModal,
  persistServiceAddrInput,
  uiLowTransparencyToggleId,
  upstreamProxyHintText,
  backgroundTasksRestartKeysDefault,
} = settingsController;

function normalizeErrorMessage(err) {
  const raw = String(err && err.message ? err.message : err).trim();
  if (!raw) {
    return "未知错误";
  }
  return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
}

const {
  handleCheckUpdateClick,
  scheduleStartupUpdateCheck,
  bootstrapUpdateStatus,
} = createUpdateController({
  dom,
  showToast,
  showConfirmDialog,
  normalizeErrorMessage,
  isTauriRuntime,
  readUpdateAutoCheckSetting,
  updateCheck,
  updateDownload,
  updateInstall,
  updateRestart,
  updateStatus,
  withButtonBusy,
  nextPaintTick,
  updateCheckDelayMs: UPDATE_CHECK_DELAY_MS,
});

function nextPaintTick() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function readLastApiModelsRemoteRefreshAt() {
  if (typeof localStorage === "undefined") {
    return 0;
  }
  const raw = localStorage.getItem(API_MODELS_REMOTE_REFRESH_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function writeLastApiModelsRemoteRefreshAt(ts = Date.now()) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(API_MODELS_REMOTE_REFRESH_STORAGE_KEY, String(Math.max(0, Math.floor(ts))));
}

function buildRefreshAllTasks(options = {}) {
  const refreshRemoteUsage = options.refreshRemoteUsage === true;
  const refreshRemoteModels = options.refreshRemoteModels === true;
  return [
    { name: "accounts", label: "账号列表", run: refreshAccounts },
    { name: "usage", label: "账号用量", run: () => refreshUsageList({ refreshRemote: refreshRemoteUsage }) },
    { name: "api-models", label: "模型列表", run: () => refreshApiModels({ refreshRemote: refreshRemoteModels }) },
    { name: "api-keys", label: "平台密钥", run: refreshApiKeys },
    { name: "request-logs", label: "请求日志", run: () => refreshRequestLogs(state.requestLogQuery) },
    { name: "request-log-today-summary", label: "今日摘要", run: refreshRequestLogTodaySummary },
  ];
}

function shouldRefreshApiModelsRemote(force = false) {
  if (force) {
    return true;
  }
  const hasLocalCache = Array.isArray(state.apiModelOptions) && state.apiModelOptions.length > 0;
  if (!hasLocalCache) {
    return true;
  }
  const lastRefreshAt = readLastApiModelsRemoteRefreshAt();
  if (lastRefreshAt <= 0) {
    return true;
  }
  return (Date.now() - lastRefreshAt) >= API_MODELS_REMOTE_REFRESH_INTERVAL_MS;
}

async function maybeRefreshApiModelsCache(options = {}) {
  const force = options && options.force === true;
  if (!shouldRefreshApiModelsRemote(force)) {
    return false;
  }
  if (apiModelsRemoteRefreshInFlight) {
    return apiModelsRemoteRefreshInFlight;
  }
  apiModelsRemoteRefreshInFlight = (async () => {
    const connected = await ensureConnected();
    if (!connected) {
      return false;
    }
    await refreshApiModels({ refreshRemote: true });
    writeLastApiModelsRemoteRefreshAt(Date.now());
    if (dom.modalApiKey && dom.modalApiKey.classList.contains("active")) {
      populateApiKeyModelSelect();
    }
    if (state.currentPage === "apikeys") {
      renderCurrentPageView("apikeys");
    }
    return true;
  })();
  try {
    return await apiModelsRemoteRefreshInFlight;
  } catch (err) {
    console.error("[api-models] remote refresh failed", err);
    return false;
  } finally {
    apiModelsRemoteRefreshInFlight = null;
  }
}

async function refreshAll(options = {}) {
  if (refreshAllInFlight) {
    return refreshAllInFlight;
  }
  refreshAllInFlight = (async () => {
    const tasks = buildRefreshAllTasks(options);
    const total = tasks.length;
    let completed = 0;
    const setProgress = (next) => {
      renderAccountsRefreshProgress(setRefreshAllProgress(next));
    };
    setProgress({ active: true, manual: false, total, completed: 0, remaining: total, lastTaskLabel: "" });

    const ok = await ensureConnected();
    serviceLifecycle.updateServiceToggle();
    if (!ok) return [];
    await syncRuntimeSettingsForCurrentProbe();

    // 中文注释：全并发会制造瞬时抖动（同时多次 RPC/DOM 更新）；这里改为有限并发并统一限流上限。
    const results = await runRefreshTasks(
      tasks.map((task) => ({
        ...task,
        run: async () => {
          try {
            return await task.run();
          } finally {
            completed += 1;
            setProgress({
              active: true,
              manual: false,
              total,
              completed,
              remaining: total - completed,
              lastTaskLabel: task.label || task.name,
            });
            await nextPaintTick();
          }
        },
      })),
      (taskName, err) => {
        console.error(`[refreshAll] ${taskName} failed`, err);
      },
      {
        concurrency: options.concurrency,
        taskTimeoutMs: options.taskTimeoutMs ?? 8000,
      },
    );
    if (options.refreshRemoteModels === true) {
      const modelTask = results.find((item) => item.name === "api-models");
      if (modelTask && modelTask.status === "fulfilled") {
        writeLastApiModelsRemoteRefreshAt(Date.now());
      }
    }
    // 中文注释：并行刷新时允许“部分失败部分成功”，否则某个慢/失败接口会拖垮整页刷新体验。
    const failedTasks = results.filter((item) => item.status === "rejected");
    if (failedTasks.length > 0) {
      const taskLabelMap = new Map(tasks.map((task) => [task.name, task.label || task.name]));
      const failedLabels = [...new Set(failedTasks.map((task) => taskLabelMap.get(task.name) || task.name))];
      const failedLabelText = failedLabels.length > 3
        ? `${failedLabels.slice(0, 3).join("、")} 等${failedLabels.length}项`
        : failedLabels.join("、");
      const firstFailedMessage = normalizeErrorMessage(failedTasks[0].reason);
      // 中文注释：自动刷新触发的失败仅记日志，避免每分钟弹错打断；手动刷新才提示具体失败项。
      if (options.manual === true) {
        const detail = firstFailedMessage ? `（示例错误：${firstFailedMessage}）` : "";
        showToast(`部分数据刷新失败：${failedLabelText}，已展示可用数据${detail}`, "error");
      } else {
        console.warn(
          `[refreshAll] 部分失败：${failedLabelText}；首个错误：${firstFailedMessage || "未知"}`,
        );
      }
    }
    renderCurrentPageView();
  })();
  try {
    return await refreshAllInFlight;
  } finally {
    refreshAllInFlight = null;
    if (refreshAllProgressClearTimer) {
      clearTimeout(refreshAllProgressClearTimer);
    }
    refreshAllProgressClearTimer = setTimeout(() => {
      renderAccountsRefreshProgress(clearRefreshAllProgress());
      refreshAllProgressClearTimer = null;
    }, 450);
  }
}

async function handleRefreshAllClick() {
  await withButtonBusy(dom.refreshAll, "刷新中...", async () => {
    // 中文注释：先让浏览器绘制 loading 态，避免用户感知“点击后卡住”。
    if (refreshAllProgressClearTimer) {
      clearTimeout(refreshAllProgressClearTimer);
      refreshAllProgressClearTimer = null;
    }
    renderAccountsRefreshProgress(setRefreshAllProgress({
      active: true,
      manual: true,
      total: 1,
      completed: 0,
      remaining: 1,
      lastTaskLabel: "",
    }));
    await nextPaintTick();
    const ok = await ensureConnected();
    serviceLifecycle.updateServiceToggle();
    if (!ok) {
      return;
    }
    let accounts = Array.isArray(state.accountList) ? state.accountList.filter((item) => item && item.id) : [];
  if (accounts.length === 0) {
    try {
      await refreshAccounts();
      await refreshAccountsPage({ latestOnly: true }).catch(() => false);
    } catch (err) {
      console.error("[refreshUsageOnly] load accounts failed", err);
    }
      accounts = Array.isArray(state.accountList) ? state.accountList.filter((item) => item && item.id) : [];
    }
    const total = accounts.length;
    if (total <= 0) {
      renderAccountsRefreshProgress(setRefreshAllProgress({
        active: true,
        manual: true,
        total: 1,
        completed: 1,
        remaining: 0,
        lastTaskLabel: "无可刷新账号",
      }));
      return;
    }
    renderAccountsRefreshProgress(setRefreshAllProgress({
      active: true,
      manual: true,
      total,
      completed: 0,
      remaining: total,
      lastTaskLabel: "",
    }));

    let completed = 0;
    let failed = 0;
    try {
      for (const account of accounts) {
        const label = String(account.label || account.id || "").trim() || "未知账号";
        try {
          await serviceUsageRefresh(account.id);
        } catch (err) {
          failed += 1;
          console.error(`[refreshUsageOnly] account refresh failed: ${account.id}`, err);
        } finally {
          completed += 1;
          renderAccountsRefreshProgress(setRefreshAllProgress({
            active: true,
            manual: true,
            total,
            completed,
            remaining: Math.max(0, total - completed),
            lastTaskLabel: label,
          }));
        }
      }
      await refreshUsageList({ refreshRemote: false });
      renderCurrentPageView("accounts");
      if (failed > 0) {
        showToast(`用量刷新完成，失败 ${failed}/${total}`, "error");
      }
    } catch (err) {
      console.error("[refreshUsageOnly] failed", err);
      showToast("账号用量刷新失败，请稍后重试", "error");
    } finally {
      if (refreshAllProgressClearTimer) {
        clearTimeout(refreshAllProgressClearTimer);
      }
      refreshAllProgressClearTimer = setTimeout(() => {
        renderAccountsRefreshProgress(clearRefreshAllProgress());
        refreshAllProgressClearTimer = null;
      }, 450);
    }
  });
}

async function refreshAccountsAndUsage() {
  const options = arguments[0] || {};
  const includeUsage = options.includeUsage !== false;
  const includeAccountPage = options.includeAccountPage !== false && state.currentPage === "accounts";
  const ok = await ensureConnected();
  serviceLifecycle.updateServiceToggle();
  if (!ok) return false;

  const tasks = [{ name: "accounts", run: refreshAccounts }];
  if (includeUsage) {
    tasks.push({ name: "usage", run: refreshUsageList });
  }
  const results = await runRefreshTasks(
    tasks,
    (taskName, err) => {
      console.error(`[refreshAccountsAndUsage] ${taskName} failed`, err);
    },
    {
      taskTimeoutMs: options.taskTimeoutMs ?? 8000,
    },
  );
  const failed = results.some((item) => item.status === "rejected");
  if (failed) {
    return false;
  }
  if (includeAccountPage) {
    try {
      await refreshAccountsPage({ latestOnly: true });
    } catch (err) {
      console.error("[refreshAccountsAndUsage] account-page failed", err);
      return false;
    }
  }
  return true;
}

const serviceLifecycle = createServiceLifecycle({
  state,
  dom,
  setServiceHint,
  normalizeAddr,
  startService,
  stopService,
  waitForConnection,
  refreshAll,
  maybeRefreshApiModelsCache,
  ensureAutoRefreshTimer,
  stopAutoRefreshTimer,
  onStartupState: (loading, message) => setStartupMask(loading, message),
});

settingsServiceSync = createSettingsServiceSync({
  state,
  showToast,
  normalizeErrorMessage,
  isTauriRuntime,
  ensureConnected,
  serviceLifecycle,
  serviceGatewayRouteStrategySet,
  serviceGatewayHeaderPolicySet,
  serviceGatewayUpstreamProxySet,
  serviceGatewayBackgroundTasksSet,
  readRouteStrategySetting,
  saveRouteStrategySetting,
  setRouteStrategySelect,
  normalizeRouteStrategy,
  routeStrategyLabel,
  readCpaNoCookieHeaderModeSetting,
  saveCpaNoCookieHeaderModeSetting,
  setCpaNoCookieHeaderModeToggle,
  normalizeCpaNoCookieHeaderMode,
  readUpstreamProxyUrlSetting,
  saveUpstreamProxyUrlSetting,
  setUpstreamProxyInput,
  setUpstreamProxyHint,
  normalizeUpstreamProxyUrl,
  upstreamProxyHintText,
  readBackgroundTasksSetting,
  saveBackgroundTasksSetting,
  setBackgroundTasksForm,
  normalizeBackgroundTasksSettings,
  updateBackgroundTasksHint,
  backgroundTasksRestartKeysDefault,
});

function requireSettingsServiceSync() {
  if (!settingsServiceSync) {
    throw new Error("settings service sync is not ready");
  }
  return settingsServiceSync;
}

async function applyRouteStrategyToService(strategy, options) {
  return requireSettingsServiceSync().applyRouteStrategyToService(strategy, options);
}

async function applyCpaNoCookieHeaderModeToService(enabled, options) {
  return requireSettingsServiceSync().applyCpaNoCookieHeaderModeToService(enabled, options);
}

async function applyUpstreamProxyToService(proxyUrl, options) {
  return requireSettingsServiceSync().applyUpstreamProxyToService(proxyUrl, options);
}

async function applyBackgroundTasksToService(settings, options) {
  return requireSettingsServiceSync().applyBackgroundTasksToService(settings, options);
}

async function syncRuntimeSettingsForCurrentProbe() {
  return requireSettingsServiceSync().syncRuntimeSettingsForCurrentProbe();
}

async function syncRuntimeSettingsOnStartup() {
  return requireSettingsServiceSync().syncRuntimeSettingsOnStartup();
}

const loginFlow = createLoginFlow({
  dom,
  state,
  withButtonBusy,
  ensureConnected,
  refreshAll,
  closeAccountModal,
});

const managementActions = createManagementActions({
  dom,
  state,
  ensureConnected,
  withButtonBusy,
  showToast,
  showConfirmDialog,
  clearRequestLogs,
  refreshRequestLogs,
  renderRequestLogs,
  refreshAccountsAndUsage,
  renderAccountsView,
  renderCurrentPageView,
  openUsageModal,
  renderUsageSnapshot,
  refreshApiModels,
  refreshApiKeys,
  populateApiKeyModelSelect,
  renderApiKeys,
});

const {
  handleClearRequestLogs,
  updateAccountSort,
  setManualPreferredAccount,
  deleteAccount,
  importAccountsFromFiles,
  importAccountsFromDirectory,
  importAccountsFromRegisterDb,
  deleteSelectedAccounts,
  deleteUnavailableFreeAccounts,
  exportAccountsByFile,
  handleOpenUsageModal,
  refreshUsageForAccount,
  createApiKey,
  deleteApiKey,
  toggleApiKeyStatus,
  updateApiKeyModel,
  copyApiKey,
  refreshApiModelsNow,
} = managementActions;

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

function renderAccountsView() {
  renderAccountsOnly(buildMainRenderActions());
}

function bindEvents() {
  bindMainEvents({
    dom,
    state,
    switchPage,
    openAccountModal,
    openApiKeyModal,
    closeAccountModal,
    handleLogin: loginFlow.handleLogin,
    handleCancelLogin: loginFlow.handleCancelLogin,
    showToast,
    handleManualCallback: loginFlow.handleManualCallback,
    closeUsageModal,
    refreshUsageForAccount,
    closeApiKeyModal,
    createApiKey,
    handleClearRequestLogs,
    refreshRequestLogs,
    renderRequestLogs,
    refreshAll: handleRefreshAllClick,
    ensureConnected,
    refreshApiModels,
    refreshApiModelsNow,
    populateApiKeyModelSelect,
    importAccountsFromFiles,
    importAccountsFromDirectory,
    importAccountsFromRegisterDb,
    deleteSelectedAccounts,
    deleteUnavailableFreeAccounts,
    exportAccountsByFile,
    toggleThemePanel,
    closeThemePanel,
    setTheme,
    handleServiceToggle: serviceLifecycle.handleServiceToggle,
    renderAccountsView,
    refreshAccountsPage: (options) => reloadAccountsPage(options),
    updateRequestLogFilterButtons,
  });

  bindSettingsEvents({
    dom,
    showToast,
    withButtonBusy,
    normalizeErrorMessage,
    saveAppSettingsPatch,
    handleCheckUpdateClick,
    isTauriRuntime,
    readUpdateAutoCheckSetting,
    saveUpdateAutoCheckSetting,
    readCloseToTrayOnCloseSetting,
    saveCloseToTrayOnCloseSetting,
    setCloseToTrayOnCloseToggle,
    applyCloseToTrayOnCloseSetting,
    readLightweightModeOnCloseToTraySetting,
    saveLightweightModeOnCloseToTraySetting,
    setLightweightModeOnCloseToTrayToggle,
    syncLightweightModeOnCloseToTrayAvailability,
    applyLightweightModeOnCloseToTraySetting,
    readRouteStrategySetting,
    normalizeRouteStrategy,
    saveRouteStrategySetting,
    setRouteStrategySelect,
    applyRouteStrategyToService,
    routeStrategyLabel,
    readServiceListenModeSetting,
    normalizeServiceListenMode,
    setServiceListenModeSelect,
    setServiceListenModeHint,
    buildServiceListenModeHint,
    applyServiceListenModeToService,
    readCpaNoCookieHeaderModeSetting,
    saveCpaNoCookieHeaderModeSetting,
    setCpaNoCookieHeaderModeToggle,
    normalizeCpaNoCookieHeaderMode,
    applyCpaNoCookieHeaderModeToService,
    readUpstreamProxyUrlSetting,
    saveUpstreamProxyUrlSetting,
    setUpstreamProxyInput,
    setUpstreamProxyHint,
    normalizeUpstreamProxyUrl,
    applyUpstreamProxyToService,
    upstreamProxyHintText,
    readBackgroundTasksSetting,
    readBackgroundTasksForm,
    saveBackgroundTasksSetting,
    setBackgroundTasksForm,
    normalizeBackgroundTasksSettings,
    updateBackgroundTasksHint,
    applyBackgroundTasksToService,
    backgroundTasksRestartKeysDefault,
    getEnvOverrideSelectedKey,
    findEnvOverrideCatalogItem,
    setEnvOverridesHint,
    readEnvOverridesSetting,
    buildEnvOverrideHint,
    normalizeEnvOverrides,
    normalizeEnvOverrideCatalog,
    saveEnvOverridesSetting,
    renderEnvOverrideEditor,
    persistServiceAddrInput,
    uiLowTransparencyToggleId,
    readLowTransparencySetting,
    saveLowTransparencySetting,
    applyLowTransparencySetting,
    syncWebAccessPasswordInputs,
    saveWebAccessPassword,
    clearWebAccessPassword,
    openWebSecurityModal,
    closeWebSecurityModal,
  });
}

async function bootstrap() {
  setStartupMask(true, "正在初始化界面...");
  setStatus("", false);
  await loadAppSettings();
  const browserMode = applyBrowserModeUi();
  setServiceHint(browserMode ? "浏览器模式：请先启动 codexmanager-service" : "请输入端口并点击启动", false);
  renderThemeButtons();
  const initialSettings = getAppSettingsSnapshot();
  restoreTheme(initialSettings.theme);
  initLowTransparencySetting();
  initUpdateAutoCheckSetting();
  initCloseToTrayOnCloseSetting();
  initLightweightModeOnCloseToTraySetting();
  initServiceListenModeSetting();
  initRouteStrategySetting();
  initCpaNoCookieHeaderModeSetting();
  initUpstreamProxySetting();
  initBackgroundTasksSetting();
  initEnvOverridesSetting();
  updateWebAccessPasswordState(initialSettings.webAccessPasswordConfigured);
  void bootstrapUpdateStatus();
  serviceLifecycle.restoreServiceAddr();
  serviceLifecycle.updateServiceToggle();
  bindEvents();
  renderCurrentPageView();
  updateRequestLogFilterButtons();
  scheduleStartupUpdateCheck();
  void serviceLifecycle.autoStartService()
    .catch((err) => {
      console.error("[bootstrap] autoStartService failed", err);
    })
    .finally(() => {
      setStartupMask(false);
      void syncServiceListenModeOnStartup().catch((err) => {
        console.error("[bootstrap] syncServiceListenModeOnStartup failed", err);
      });
      void syncRuntimeSettingsOnStartup().catch((err) => {
        console.error("[bootstrap] syncRuntimeSettingsOnStartup failed", err);
      });
    });
}

window.addEventListener("DOMContentLoaded", () => {
  void bootstrap();
});







