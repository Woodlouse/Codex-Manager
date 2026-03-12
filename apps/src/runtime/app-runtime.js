const API_MODELS_REMOTE_REFRESH_STORAGE_KEY = "codexmanager.apikey.models.last_remote_refresh_at";
const API_MODELS_REMOTE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function createAppRuntime(deps) {
  const {
    state,
    dom,
    ensureConnected,
    refreshAccounts,
    refreshAccountsPage,
    refreshUsageList,
    refreshApiKeys,
    refreshApiModels,
    refreshRequestLogs,
    refreshRequestLogTodaySummary,
    serviceUsageRefresh,
    runRefreshTasks,
    renderAccountsRefreshProgress,
    setRefreshAllProgress,
    clearRefreshAllProgress,
    renderCurrentPageView,
    showToast,
    serviceLifecycle,
    syncRuntimeSettingsForCurrentProbe,
    populateApiKeyModelSelect,
  } = deps;

  let refreshAllInFlight = null;
  let refreshAllProgressClearTimer = null;
  let apiModelsRemoteRefreshInFlight = null;

  function normalizeErrorMessage(err) {
    const raw = String(err && err.message ? err.message : err).trim();
    if (!raw) {
      return "未知错误";
    }
    return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
  }

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

      const failedTasks = results.filter((item) => item.status === "rejected");
      if (failedTasks.length > 0) {
        const taskLabelMap = new Map(tasks.map((task) => [task.name, task.label || task.name]));
        const failedLabels = [...new Set(failedTasks.map((task) => taskLabelMap.get(task.name) || task.name))];
        const failedLabelText = failedLabels.length > 3
          ? `${failedLabels.slice(0, 3).join("、")} 等${failedLabels.length}项`
          : failedLabels.join("、");
        const firstFailedMessage = normalizeErrorMessage(failedTasks[0].reason);
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
      return results;
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
    const clearProgressLater = () => {
      if (refreshAllProgressClearTimer) {
        clearTimeout(refreshAllProgressClearTimer);
      }
      refreshAllProgressClearTimer = setTimeout(() => {
        renderAccountsRefreshProgress(clearRefreshAllProgress());
        refreshAllProgressClearTimer = null;
      }, 450);
    };

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
      clearProgressLater();
    }
  }

  async function refreshAccountsAndUsage(options = {}) {
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

  return {
    normalizeErrorMessage,
    nextPaintTick,
    maybeRefreshApiModelsCache,
    refreshAll,
    handleRefreshAllClick,
    refreshAccountsAndUsage,
  };
}
