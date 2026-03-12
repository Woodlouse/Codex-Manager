import {
  DEFAULT_BACKGROUND_TASKS_SETTINGS,
  DEFAULT_GATEWAY_TRANSPORT_SETTINGS,
  defaultAppSettingsGet,
  defaultAppSettingsSet,
  normalizeBooleanSetting,
  normalizePositiveInteger,
  normalizeThemeSetting,
} from "./shared.js";

export function createSettingsSnapshotStore(deps = {}) {
  const {
    state = {},
    isTauriRuntime = () => false,
    appSettingsGet = defaultAppSettingsGet,
    appSettingsSet = defaultAppSettingsSet,
    normalizeAddr,
    normalizeRouteStrategy,
    normalizeServiceListenMode,
    normalizeCpaNoCookieHeaderMode,
    normalizeUpstreamProxyUrl,
    normalizeEnvOverrideCatalog,
    normalizeEnvOverrides,
    normalizeStringList,
  } = deps;

  let appSettingsSnapshot = buildDefaultAppSettingsSnapshot();

  function normalizeBackgroundTasksSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      usagePollingEnabled: normalizeBooleanSetting(
        source.usagePollingEnabled,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.usagePollingEnabled,
      ),
      usagePollIntervalSecs: normalizePositiveInteger(
        source.usagePollIntervalSecs,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.usagePollIntervalSecs,
        1,
      ),
      gatewayKeepaliveEnabled: normalizeBooleanSetting(
        source.gatewayKeepaliveEnabled,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.gatewayKeepaliveEnabled,
      ),
      gatewayKeepaliveIntervalSecs: normalizePositiveInteger(
        source.gatewayKeepaliveIntervalSecs,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.gatewayKeepaliveIntervalSecs,
        1,
      ),
      tokenRefreshPollingEnabled: normalizeBooleanSetting(
        source.tokenRefreshPollingEnabled,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.tokenRefreshPollingEnabled,
      ),
      tokenRefreshPollIntervalSecs: normalizePositiveInteger(
        source.tokenRefreshPollIntervalSecs,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.tokenRefreshPollIntervalSecs,
        1,
      ),
      usageRefreshWorkers: normalizePositiveInteger(
        source.usageRefreshWorkers,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.usageRefreshWorkers,
        1,
      ),
      httpWorkerFactor: normalizePositiveInteger(
        source.httpWorkerFactor,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.httpWorkerFactor,
        1,
      ),
      httpWorkerMin: normalizePositiveInteger(
        source.httpWorkerMin,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.httpWorkerMin,
        1,
      ),
      httpStreamWorkerFactor: normalizePositiveInteger(
        source.httpStreamWorkerFactor,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.httpStreamWorkerFactor,
        1,
      ),
      httpStreamWorkerMin: normalizePositiveInteger(
        source.httpStreamWorkerMin,
        DEFAULT_BACKGROUND_TASKS_SETTINGS.httpStreamWorkerMin,
        1,
      ),
    };
  }

  function normalizeGatewayTransportSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      sseKeepaliveIntervalMs: normalizePositiveInteger(
        source.sseKeepaliveIntervalMs,
        DEFAULT_GATEWAY_TRANSPORT_SETTINGS.sseKeepaliveIntervalMs,
        1,
      ),
      upstreamStreamTimeoutMs: normalizePositiveInteger(
        source.upstreamStreamTimeoutMs,
        DEFAULT_GATEWAY_TRANSPORT_SETTINGS.upstreamStreamTimeoutMs,
        0,
      ),
    };
  }

  function buildDefaultAppSettingsSnapshot() {
    return {
      updateAutoCheck: true,
      closeToTrayOnClose: false,
      closeToTraySupported: isTauriRuntime(),
      lightweightModeOnCloseToTray: false,
      lowTransparency: false,
      theme: "tech",
      serviceAddr: "localhost:48760",
      serviceListenMode: normalizeServiceListenMode(null),
      routeStrategy: normalizeRouteStrategy(null),
      cpaNoCookieHeaderModeEnabled: false,
      upstreamProxyUrl: "",
      ...normalizeGatewayTransportSettings(DEFAULT_GATEWAY_TRANSPORT_SETTINGS),
      backgroundTasks: normalizeBackgroundTasksSettings(DEFAULT_BACKGROUND_TASKS_SETTINGS),
      envOverrides: {},
      envOverrideCatalog: [],
      envOverrideReservedKeys: [],
      envOverrideUnsupportedKeys: [],
      webAccessPasswordConfigured: false,
    };
  }

  function normalizeAppSettingsSnapshot(source) {
    const payload = source && typeof source === "object" ? source : {};
    const defaults = buildDefaultAppSettingsSnapshot();
    let serviceAddr = defaults.serviceAddr;
    try {
      serviceAddr = normalizeAddr(payload.serviceAddr || defaults.serviceAddr);
    } catch {
      serviceAddr = defaults.serviceAddr;
    }
    return {
      updateAutoCheck: normalizeBooleanSetting(payload.updateAutoCheck, defaults.updateAutoCheck),
      closeToTrayOnClose: normalizeBooleanSetting(
        payload.closeToTrayOnClose,
        defaults.closeToTrayOnClose,
      ),
      closeToTraySupported: normalizeBooleanSetting(
        payload.closeToTraySupported,
        defaults.closeToTraySupported,
      ),
      lightweightModeOnCloseToTray: normalizeBooleanSetting(
        payload.lightweightModeOnCloseToTray,
        defaults.lightweightModeOnCloseToTray,
      ),
      lowTransparency: normalizeBooleanSetting(payload.lowTransparency, defaults.lowTransparency),
      theme: normalizeThemeSetting(payload.theme),
      serviceAddr,
      serviceListenMode: normalizeServiceListenMode(payload.serviceListenMode),
      routeStrategy: normalizeRouteStrategy(payload.routeStrategy),
      cpaNoCookieHeaderModeEnabled: normalizeCpaNoCookieHeaderMode(
        payload.cpaNoCookieHeaderModeEnabled,
      ),
      upstreamProxyUrl: normalizeUpstreamProxyUrl(payload.upstreamProxyUrl),
      ...normalizeGatewayTransportSettings({
        sseKeepaliveIntervalMs: payload.sseKeepaliveIntervalMs,
        upstreamStreamTimeoutMs: payload.upstreamStreamTimeoutMs,
      }),
      backgroundTasks: normalizeBackgroundTasksSettings(payload.backgroundTasks),
      envOverrides: normalizeEnvOverrides(payload.envOverrides),
      envOverrideCatalog: normalizeEnvOverrideCatalog(payload.envOverrideCatalog),
      envOverrideReservedKeys: normalizeStringList(payload.envOverrideReservedKeys),
      envOverrideUnsupportedKeys: normalizeStringList(payload.envOverrideUnsupportedKeys),
      webAccessPasswordConfigured: normalizeBooleanSetting(
        payload.webAccessPasswordConfigured,
        defaults.webAccessPasswordConfigured,
      ),
    };
  }

  function getAppSettingsSnapshot() {
    return appSettingsSnapshot;
  }

  function setAppSettingsSnapshot(snapshot) {
    appSettingsSnapshot = normalizeAppSettingsSnapshot(snapshot);
    if (state && typeof state === "object") {
      state.serviceAddr = appSettingsSnapshot.serviceAddr;
    }
    return appSettingsSnapshot;
  }

  function patchAppSettingsSnapshot(patch = {}) {
    const next = {
      ...appSettingsSnapshot,
      ...(patch && typeof patch === "object" ? patch : {}),
    };
    if (patch && Object.prototype.hasOwnProperty.call(patch, "backgroundTasks")) {
      next.backgroundTasks = patch.backgroundTasks;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "envOverrides")) {
      next.envOverrides = patch.envOverrides;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "envOverrideCatalog")) {
      next.envOverrideCatalog = patch.envOverrideCatalog;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "envOverrideReservedKeys")) {
      next.envOverrideReservedKeys = patch.envOverrideReservedKeys;
    }
    if (patch && Object.prototype.hasOwnProperty.call(patch, "envOverrideUnsupportedKeys")) {
      next.envOverrideUnsupportedKeys = patch.envOverrideUnsupportedKeys;
    }
    return setAppSettingsSnapshot(next);
  }

  async function loadAppSettings() {
    try {
      return setAppSettingsSnapshot(await appSettingsGet());
    } catch (err) {
      console.warn("[app-settings] load failed", err);
      return setAppSettingsSnapshot(appSettingsSnapshot);
    }
  }

  async function saveAppSettingsPatch(patch = {}) {
    const payload = patch && typeof patch === "object" ? patch : {};
    return setAppSettingsSnapshot(await appSettingsSet(payload));
  }

  return {
    normalizeBackgroundTasksSettings,
    normalizeGatewayTransportSettings,
    getAppSettingsSnapshot,
    patchAppSettingsSnapshot,
    loadAppSettings,
    saveAppSettingsPatch,
  };
}
