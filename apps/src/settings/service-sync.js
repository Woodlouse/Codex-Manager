function getPathValue(source, path) {
  const steps = String(path || "").split(".");
  let cursor = source;
  for (const step of steps) {
    if (!cursor || typeof cursor !== "object" || !(step in cursor)) {
      return undefined;
    }
    cursor = cursor[step];
  }
  return cursor;
}

function pickFirstValue(source, paths) {
  for (const path of paths || []) {
    const value = getPathValue(source, path);
    if (value !== undefined && value !== null && String(value) !== "") {
      return value;
    }
  }
  return null;
}

function pickBooleanValue(source, paths) {
  const value = pickFirstValue(source, paths);
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

export function createSettingsServiceSync(deps = {}) {
  const {
    state = {},
    showToast = () => {},
    normalizeErrorMessage = (err) => String(err?.message || err || ""),
    isTauriRuntime = () => false,
    ensureConnected = async () => false,
    serviceLifecycle = null,
    serviceGatewayRouteStrategySet,
    serviceGatewayHeaderPolicySet,
    serviceGatewayUpstreamProxySet,
    serviceGatewayTransportSet,
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
    upstreamProxyHintText = "",
    readGatewayTransportSetting,
    saveGatewayTransportSetting,
    setGatewayTransportForm,
    normalizeGatewayTransportSettings,
    setGatewayTransportHint,
    gatewayTransportHintText = "",
    readBackgroundTasksSetting,
    saveBackgroundTasksSetting,
    setBackgroundTasksForm,
    normalizeBackgroundTasksSettings,
    updateBackgroundTasksHint,
    backgroundTasksRestartKeysDefault = [],
  } = deps;

  let routeStrategySyncInFlight = null;
  let routeStrategySyncedProbeId = -1;
  let cpaNoCookieHeaderModeSyncInFlight = null;
  let cpaNoCookieHeaderModeSyncedProbeId = -1;
  let upstreamProxySyncInFlight = null;
  let upstreamProxySyncedProbeId = -1;
  let gatewayTransportSyncInFlight = null;
  let gatewayTransportSyncedProbeId = -1;
  let backgroundTasksSyncInFlight = null;
  let backgroundTasksSyncedProbeId = -1;

  function updateServiceToggle() {
    serviceLifecycle?.updateServiceToggle?.();
  }

  function resolveRouteStrategyFromPayload(payload) {
    const picked = pickFirstValue(payload, ["strategy", "result.strategy"]);
    return normalizeRouteStrategy(picked);
  }

  async function applyRouteStrategyToService(strategy, { silent = true } = {}) {
    const normalized = normalizeRouteStrategy(strategy);
    if (routeStrategySyncInFlight) {
      return routeStrategySyncInFlight;
    }
    routeStrategySyncInFlight = (async () => {
      const connected = await ensureConnected();
      updateServiceToggle();
      if (!connected) {
        if (!silent) {
          showToast("服务未连接，稍后会自动应用选路策略", "error");
        }
        return false;
      }
      const response = await serviceGatewayRouteStrategySet(normalized);
      const applied = resolveRouteStrategyFromPayload(response);
      saveRouteStrategySetting(applied);
      setRouteStrategySelect(applied);
      routeStrategySyncedProbeId = state.serviceProbeId;
      if (!silent) {
        showToast(`已切换为${routeStrategyLabel(applied)}`);
      }
      return true;
    })();

    try {
      return await routeStrategySyncInFlight;
    } catch (err) {
      if (!silent) {
        showToast(`切换失败：${normalizeErrorMessage(err)}`, "error");
      }
      return false;
    } finally {
      routeStrategySyncInFlight = null;
    }
  }

  function resolveCpaNoCookieHeaderModeFromPayload(payload) {
    const value = pickBooleanValue(payload, [
      "cpaNoCookieHeaderModeEnabled",
      "enabled",
      "result.cpaNoCookieHeaderModeEnabled",
      "result.enabled",
    ]);
    return Boolean(value);
  }

  async function applyCpaNoCookieHeaderModeToService(enabled, { silent = true } = {}) {
    const normalized = normalizeCpaNoCookieHeaderMode(enabled);
    if (cpaNoCookieHeaderModeSyncInFlight) {
      return cpaNoCookieHeaderModeSyncInFlight;
    }
    cpaNoCookieHeaderModeSyncInFlight = (async () => {
      const connected = await ensureConnected();
      updateServiceToggle();
      if (!connected) {
        if (!silent) {
          showToast("服务未连接，稍后会自动应用头策略开关", "error");
        }
        return false;
      }
      const response = await serviceGatewayHeaderPolicySet(normalized);
      const applied = resolveCpaNoCookieHeaderModeFromPayload(response);
      saveCpaNoCookieHeaderModeSetting(applied);
      setCpaNoCookieHeaderModeToggle(applied);
      cpaNoCookieHeaderModeSyncedProbeId = state.serviceProbeId;
      if (!silent) {
        showToast(applied ? "已启用请求头收敛策略" : "已关闭请求头收敛策略");
      }
      return true;
    })();

    try {
      return await cpaNoCookieHeaderModeSyncInFlight;
    } catch (err) {
      if (!silent) {
        showToast(`切换失败：${normalizeErrorMessage(err)}`, "error");
      }
      return false;
    } finally {
      cpaNoCookieHeaderModeSyncInFlight = null;
    }
  }

  function resolveUpstreamProxyUrlFromPayload(payload) {
    const picked = pickFirstValue(payload, ["proxyUrl", "result.proxyUrl", "url", "result.url"]);
    return normalizeUpstreamProxyUrl(picked);
  }

  async function applyUpstreamProxyToService(proxyUrl, { silent = true } = {}) {
    const normalized = normalizeUpstreamProxyUrl(proxyUrl);
    if (upstreamProxySyncInFlight) {
      return upstreamProxySyncInFlight;
    }
    upstreamProxySyncInFlight = (async () => {
      const connected = await ensureConnected();
      updateServiceToggle();
      if (!connected) {
        if (!silent) {
          showToast("服务未连接，稍后会自动应用上游代理", "error");
        }
        return false;
      }
      const response = await serviceGatewayUpstreamProxySet(normalized || null);
      const applied = resolveUpstreamProxyUrlFromPayload(response);
      saveUpstreamProxyUrlSetting(applied);
      setUpstreamProxyInput(applied);
      setUpstreamProxyHint(upstreamProxyHintText);
      upstreamProxySyncedProbeId = state.serviceProbeId;
      if (!silent) {
        showToast(applied ? "上游代理已保存并生效" : "已清空上游代理，恢复直连");
      }
      return true;
    })();

    try {
      return await upstreamProxySyncInFlight;
    } catch (err) {
      if (!silent) {
        showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
        setUpstreamProxyHint(`保存失败：${normalizeErrorMessage(err)}`);
      }
      return false;
    } finally {
      upstreamProxySyncInFlight = null;
    }
  }

  function resolveGatewayTransportSettingsFromPayload(payload) {
    return normalizeGatewayTransportSettings({
      sseKeepaliveIntervalMs: pickFirstValue(payload, [
        "sseKeepaliveIntervalMs",
        "result.sseKeepaliveIntervalMs",
      ]),
      upstreamStreamTimeoutMs: pickFirstValue(payload, [
        "upstreamStreamTimeoutMs",
        "result.upstreamStreamTimeoutMs",
      ]),
    });
  }

  async function applyGatewayTransportToService(settings, { silent = true } = {}) {
    const normalized = normalizeGatewayTransportSettings(settings);
    if (gatewayTransportSyncInFlight) {
      return gatewayTransportSyncInFlight;
    }
    gatewayTransportSyncInFlight = (async () => {
      const connected = await ensureConnected();
      updateServiceToggle();
      if (!connected) {
        if (!silent) {
          showToast("服务未连接，稍后会自动应用网关传输设置", "error");
        }
        return false;
      }
      const response = await serviceGatewayTransportSet(normalized);
      const applied = resolveGatewayTransportSettingsFromPayload(response);
      saveGatewayTransportSetting(applied);
      setGatewayTransportForm(applied);
      setGatewayTransportHint(gatewayTransportHintText);
      gatewayTransportSyncedProbeId = state.serviceProbeId;
      if (!silent) {
        showToast("网关传输设置已保存");
      }
      return true;
    })();

    try {
      return await gatewayTransportSyncInFlight;
    } catch (err) {
      if (!silent) {
        setGatewayTransportHint(`保存失败：${normalizeErrorMessage(err)}`);
        showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
      }
      return false;
    } finally {
      gatewayTransportSyncInFlight = null;
    }
  }

  function resolveBackgroundTasksSettingsFromPayload(payload) {
    return normalizeBackgroundTasksSettings({
      usagePollingEnabled: pickBooleanValue(payload, [
        "usagePollingEnabled",
        "result.usagePollingEnabled",
      ]),
      usagePollIntervalSecs: pickFirstValue(payload, [
        "usagePollIntervalSecs",
        "result.usagePollIntervalSecs",
      ]),
      gatewayKeepaliveEnabled: pickBooleanValue(payload, [
        "gatewayKeepaliveEnabled",
        "result.gatewayKeepaliveEnabled",
      ]),
      gatewayKeepaliveIntervalSecs: pickFirstValue(payload, [
        "gatewayKeepaliveIntervalSecs",
        "result.gatewayKeepaliveIntervalSecs",
      ]),
      tokenRefreshPollingEnabled: pickBooleanValue(payload, [
        "tokenRefreshPollingEnabled",
        "result.tokenRefreshPollingEnabled",
      ]),
      tokenRefreshPollIntervalSecs: pickFirstValue(payload, [
        "tokenRefreshPollIntervalSecs",
        "result.tokenRefreshPollIntervalSecs",
      ]),
      usageRefreshWorkers: pickFirstValue(payload, [
        "usageRefreshWorkers",
        "result.usageRefreshWorkers",
      ]),
      httpWorkerFactor: pickFirstValue(payload, [
        "httpWorkerFactor",
        "result.httpWorkerFactor",
      ]),
      httpWorkerMin: pickFirstValue(payload, [
        "httpWorkerMin",
        "result.httpWorkerMin",
      ]),
      httpStreamWorkerFactor: pickFirstValue(payload, [
        "httpStreamWorkerFactor",
        "result.httpStreamWorkerFactor",
      ]),
      httpStreamWorkerMin: pickFirstValue(payload, [
        "httpStreamWorkerMin",
        "result.httpStreamWorkerMin",
      ]),
    });
  }

  function resolveBackgroundTasksRestartKeys(payload) {
    const raw = pickFirstValue(payload, [
      "requiresRestartKeys",
      "result.requiresRestartKeys",
    ]);
    if (!Array.isArray(raw)) {
      return [...backgroundTasksRestartKeysDefault];
    }
    return raw
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0);
  }

  async function applyBackgroundTasksToService(settings, { silent = true } = {}) {
    const normalized = normalizeBackgroundTasksSettings(settings);
    if (backgroundTasksSyncInFlight) {
      return backgroundTasksSyncInFlight;
    }
    backgroundTasksSyncInFlight = (async () => {
      const connected = await ensureConnected();
      updateServiceToggle();
      if (!connected) {
        if (!silent) {
          showToast("服务未连接，稍后会自动应用后台任务配置", "error");
        }
        return false;
      }
      const response = await serviceGatewayBackgroundTasksSet(normalized);
      const applied = resolveBackgroundTasksSettingsFromPayload(response);
      const restartKeys = resolveBackgroundTasksRestartKeys(response);
      saveBackgroundTasksSetting(applied);
      setBackgroundTasksForm(applied);
      updateBackgroundTasksHint(restartKeys);
      backgroundTasksSyncedProbeId = state.serviceProbeId;
      if (!silent) {
        showToast("后台任务配置已保存");
      }
      return true;
    })();

    try {
      return await backgroundTasksSyncInFlight;
    } catch (err) {
      if (!silent) {
        showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
      }
      return false;
    } finally {
      backgroundTasksSyncInFlight = null;
    }
  }

  async function syncRuntimeSettingsForCurrentProbe() {
    if (!isTauriRuntime()) {
      return;
    }
    if (routeStrategySyncedProbeId !== state.serviceProbeId) {
      await applyRouteStrategyToService(readRouteStrategySetting(), { silent: true });
    }
    if (cpaNoCookieHeaderModeSyncedProbeId !== state.serviceProbeId) {
      await applyCpaNoCookieHeaderModeToService(readCpaNoCookieHeaderModeSetting(), { silent: true });
    }
    if (upstreamProxySyncedProbeId !== state.serviceProbeId) {
      await applyUpstreamProxyToService(readUpstreamProxyUrlSetting(), { silent: true });
    }
    if (gatewayTransportSyncedProbeId !== state.serviceProbeId) {
      await applyGatewayTransportToService(readGatewayTransportSetting(), { silent: true });
    }
    if (backgroundTasksSyncedProbeId !== state.serviceProbeId) {
      await applyBackgroundTasksToService(readBackgroundTasksSetting(), { silent: true });
    }
  }

  async function syncRuntimeSettingsOnStartup() {
    if (!isTauriRuntime()) {
      return;
    }
    await applyRouteStrategyToService(readRouteStrategySetting(), { silent: true });
    await applyCpaNoCookieHeaderModeToService(readCpaNoCookieHeaderModeSetting(), { silent: true });
    await applyUpstreamProxyToService(readUpstreamProxyUrlSetting(), { silent: true });
    await applyGatewayTransportToService(readGatewayTransportSetting(), { silent: true });
    await applyBackgroundTasksToService(readBackgroundTasksSetting(), { silent: true });
  }

  return {
    applyRouteStrategyToService,
    applyCpaNoCookieHeaderModeToService,
    applyUpstreamProxyToService,
    applyGatewayTransportToService,
    applyBackgroundTasksToService,
    syncRuntimeSettingsForCurrentProbe,
    syncRuntimeSettingsOnStartup,
  };
}
