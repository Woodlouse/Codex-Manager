export function createBootstrapRunner(deps) {
  const {
    setStartupMask,
    setStatus,
    loadAppSettings,
    applyBrowserModeUi,
    setServiceHint,
    renderThemeButtons,
    getAppSettingsSnapshot,
    restoreTheme,
    initLowTransparencySetting,
    initUpdateAutoCheckSetting,
    initCloseToTrayOnCloseSetting,
    initLightweightModeOnCloseToTraySetting,
    initServiceListenModeSetting,
    initRouteStrategySetting,
    initCpaNoCookieHeaderModeSetting,
    initUpstreamProxySetting,
    initGatewayTransportSetting,
    initBackgroundTasksSetting,
    initEnvOverridesSetting,
    updateWebAccessPasswordState,
    bootstrapUpdateStatus,
    serviceLifecycle,
    bindEvents,
    renderCurrentPageView,
    updateRequestLogFilterButtons,
    scheduleStartupUpdateCheck,
    syncServiceListenModeOnStartup,
    syncRuntimeSettingsOnStartup,
  } = deps;

  return async function bootstrap() {
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
    initGatewayTransportSetting();
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
  };
}
