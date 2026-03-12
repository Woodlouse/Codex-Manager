export function bindSettingsEvents(context) {
  const {
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
    readGatewayTransportSetting,
    readGatewayTransportForm,
    saveGatewayTransportSetting,
    setGatewayTransportForm,
    normalizeGatewayTransportSettings,
    setGatewayTransportHint,
    applyGatewayTransportToService,
    gatewayTransportHintText,
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
  } = context;

  if (dom.autoCheckUpdate && dom.autoCheckUpdate.dataset.bound !== "1") {
    dom.autoCheckUpdate.dataset.bound = "1";
    dom.autoCheckUpdate.addEventListener("change", () => {
      const previousEnabled = readUpdateAutoCheckSetting();
      const enabled = Boolean(dom.autoCheckUpdate.checked);
      saveUpdateAutoCheckSetting(enabled);
      void saveAppSettingsPatch({
        updateAutoCheck: enabled,
      }).catch((err) => {
        saveUpdateAutoCheckSetting(previousEnabled);
        dom.autoCheckUpdate.checked = previousEnabled;
        showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
      });
    });
  }

  if (dom.checkUpdate && dom.checkUpdate.dataset.bound !== "1") {
    dom.checkUpdate.dataset.bound = "1";
    dom.checkUpdate.addEventListener("click", () => {
      void handleCheckUpdateClick();
    });
  }

  if (dom.closeToTrayOnClose && dom.closeToTrayOnClose.dataset.bound !== "1") {
    dom.closeToTrayOnClose.dataset.bound = "1";
    dom.closeToTrayOnClose.addEventListener("change", () => {
      const previousEnabled = readCloseToTrayOnCloseSetting();
      const enabled = Boolean(dom.closeToTrayOnClose.checked);
      void applyCloseToTrayOnCloseSetting(enabled, { silent: false }).then((applied) => {
        saveCloseToTrayOnCloseSetting(applied);
        setCloseToTrayOnCloseToggle(applied);
      }).catch(() => {
        saveCloseToTrayOnCloseSetting(previousEnabled);
        setCloseToTrayOnCloseToggle(previousEnabled);
      });
    });
  }

  if (dom.lightweightModeOnCloseToTray && dom.lightweightModeOnCloseToTray.dataset.bound !== "1") {
    dom.lightweightModeOnCloseToTray.dataset.bound = "1";
    dom.lightweightModeOnCloseToTray.addEventListener("change", () => {
      const previousEnabled = readLightweightModeOnCloseToTraySetting();
      const enabled = Boolean(dom.lightweightModeOnCloseToTray.checked);
      void applyLightweightModeOnCloseToTraySetting(enabled, { silent: false }).catch(() => {
        saveLightweightModeOnCloseToTraySetting(previousEnabled);
        setLightweightModeOnCloseToTrayToggle(previousEnabled);
        syncLightweightModeOnCloseToTrayAvailability();
      });
    });
  }

  if (dom.routeStrategySelect && dom.routeStrategySelect.dataset.bound !== "1") {
    dom.routeStrategySelect.dataset.bound = "1";
    dom.routeStrategySelect.addEventListener("change", () => {
      const previousSelected = readRouteStrategySetting();
      const selected = normalizeRouteStrategy(dom.routeStrategySelect.value);
      saveRouteStrategySetting(selected);
      setRouteStrategySelect(selected);
      void saveAppSettingsPatch({
        routeStrategy: selected,
      }).then((settings) => {
        const resolved = normalizeRouteStrategy(settings.routeStrategy);
        saveRouteStrategySetting(resolved);
        setRouteStrategySelect(resolved);
        if (isTauriRuntime()) {
          return applyRouteStrategyToService(resolved, { silent: false });
        }
        showToast(`已切换为${routeStrategyLabel(resolved)}`);
        return true;
      }).catch((err) => {
        saveRouteStrategySetting(previousSelected);
        setRouteStrategySelect(previousSelected);
        showToast(`切换失败：${normalizeErrorMessage(err)}`, "error");
      });
    });
  }

  if (dom.serviceListenModeSelect && dom.serviceListenModeSelect.dataset.bound !== "1") {
    dom.serviceListenModeSelect.dataset.bound = "1";
    dom.serviceListenModeSelect.addEventListener("change", () => {
      const previousSelected = readServiceListenModeSetting();
      const selected = normalizeServiceListenMode(dom.serviceListenModeSelect.value);
      setServiceListenModeSelect(selected);
      setServiceListenModeHint(buildServiceListenModeHint(selected, true));
      void applyServiceListenModeToService(selected, { silent: false }).then((ok) => {
        if (!ok) {
          setServiceListenModeSelect(previousSelected);
          setServiceListenModeHint(buildServiceListenModeHint(previousSelected, true));
        }
      });
    });
  }

  if (dom.cpaNoCookieHeaderMode && dom.cpaNoCookieHeaderMode.dataset.bound !== "1") {
    dom.cpaNoCookieHeaderMode.dataset.bound = "1";
    dom.cpaNoCookieHeaderMode.addEventListener("change", () => {
      const previousEnabled = readCpaNoCookieHeaderModeSetting();
      const enabled = Boolean(dom.cpaNoCookieHeaderMode.checked);
      saveCpaNoCookieHeaderModeSetting(enabled);
      setCpaNoCookieHeaderModeToggle(enabled);
      void saveAppSettingsPatch({
        cpaNoCookieHeaderModeEnabled: enabled,
      }).then((settings) => {
        const resolved = normalizeCpaNoCookieHeaderMode(settings.cpaNoCookieHeaderModeEnabled);
        saveCpaNoCookieHeaderModeSetting(resolved);
        setCpaNoCookieHeaderModeToggle(resolved);
        if (isTauriRuntime()) {
          return applyCpaNoCookieHeaderModeToService(resolved, { silent: false });
        }
        showToast(resolved ? "已启用请求头收敛策略" : "已关闭请求头收敛策略");
        return true;
      }).catch((err) => {
        saveCpaNoCookieHeaderModeSetting(previousEnabled);
        setCpaNoCookieHeaderModeToggle(previousEnabled);
        showToast(`切换失败：${normalizeErrorMessage(err)}`, "error");
      });
    });
  }

  if (dom.upstreamProxySave && dom.upstreamProxySave.dataset.bound !== "1") {
    dom.upstreamProxySave.dataset.bound = "1";
    dom.upstreamProxySave.addEventListener("click", () => {
      void withButtonBusy(dom.upstreamProxySave, "保存中...", async () => {
        const previousValue = readUpstreamProxyUrlSetting();
        const value = normalizeUpstreamProxyUrl(dom.upstreamProxyUrlInput ? dom.upstreamProxyUrlInput.value : "");
        saveUpstreamProxyUrlSetting(value);
        setUpstreamProxyInput(value);
        try {
          const settings = await saveAppSettingsPatch({
            upstreamProxyUrl: value,
          });
          const resolved = normalizeUpstreamProxyUrl(settings.upstreamProxyUrl);
          saveUpstreamProxyUrlSetting(resolved);
          setUpstreamProxyInput(resolved);
          if (isTauriRuntime()) {
            await applyUpstreamProxyToService(resolved, { silent: false });
            return;
          }
          setUpstreamProxyHint(upstreamProxyHintText);
          showToast(resolved ? "上游代理已保存并生效" : "已清空上游代理，恢复直连");
        } catch (err) {
          saveUpstreamProxyUrlSetting(previousValue);
          setUpstreamProxyInput(previousValue);
          setUpstreamProxyHint(`保存失败：${normalizeErrorMessage(err)}`);
          showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
        }
      });
    });
  }

  if (dom.gatewayTransportSave && dom.gatewayTransportSave.dataset.bound !== "1") {
    dom.gatewayTransportSave.dataset.bound = "1";
    dom.gatewayTransportSave.addEventListener("click", () => {
      void withButtonBusy(dom.gatewayTransportSave, "保存中...", async () => {
        const previousSettings = readGatewayTransportSetting();
        const parsed = readGatewayTransportForm();
        if (!parsed.ok) {
          setGatewayTransportHint(parsed.error);
          showToast(parsed.error, "error");
          return;
        }
        const nextSettings = parsed.settings;
        saveGatewayTransportSetting(nextSettings);
        setGatewayTransportForm(nextSettings);
        try {
          const settings = await saveAppSettingsPatch(nextSettings);
          const resolved = normalizeGatewayTransportSettings({
            sseKeepaliveIntervalMs: settings.sseKeepaliveIntervalMs,
            upstreamStreamTimeoutMs: settings.upstreamStreamTimeoutMs,
          });
          saveGatewayTransportSetting(resolved);
          setGatewayTransportForm(resolved);
          if (isTauriRuntime()) {
            await applyGatewayTransportToService(resolved, { silent: false });
            return;
          }
          setGatewayTransportHint(gatewayTransportHintText);
          showToast("网关传输设置已保存");
        } catch (err) {
          saveGatewayTransportSetting(previousSettings);
          setGatewayTransportForm(previousSettings);
          setGatewayTransportHint(`保存失败：${normalizeErrorMessage(err)}`);
          showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
        }
      });
    });
  }

  if (dom.backgroundTasksSave && dom.backgroundTasksSave.dataset.bound !== "1") {
    dom.backgroundTasksSave.dataset.bound = "1";
    dom.backgroundTasksSave.addEventListener("click", () => {
      void withButtonBusy(dom.backgroundTasksSave, "保存中...", async () => {
        const previousSettings = readBackgroundTasksSetting();
        const parsed = readBackgroundTasksForm();
        if (!parsed.ok) {
          showToast(parsed.error, "error");
          return;
        }
        const nextSettings = parsed.settings;
        saveBackgroundTasksSetting(nextSettings);
        setBackgroundTasksForm(nextSettings);
        try {
          const settings = await saveAppSettingsPatch({
            backgroundTasks: nextSettings,
          });
          const resolved = normalizeBackgroundTasksSettings(settings.backgroundTasks);
          saveBackgroundTasksSetting(resolved);
          setBackgroundTasksForm(resolved);
          if (isTauriRuntime()) {
            await applyBackgroundTasksToService(resolved, { silent: false });
            return;
          }
          updateBackgroundTasksHint([]);
          showToast("后台任务配置已保存");
        } catch (err) {
          saveBackgroundTasksSetting(previousSettings);
          setBackgroundTasksForm(previousSettings);
          updateBackgroundTasksHint(backgroundTasksRestartKeysDefault);
          showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
        }
      });
    });
  }

  if (dom.envOverridesSave && dom.envOverridesSave.dataset.bound !== "1") {
    dom.envOverridesSave.dataset.bound = "1";
    dom.envOverridesSave.addEventListener("click", () => {
      void withButtonBusy(dom.envOverridesSave, "保存中...", async () => {
        const item = findEnvOverrideCatalogItem(getEnvOverrideSelectedKey());
        if (!item) {
          const message = "请先选择一个环境变量";
          setEnvOverridesHint(message);
          showToast(message, "error");
          return;
        }
        const nextValue = dom.envOverrideValueInput
          ? dom.envOverrideValueInput.value.trim()
          : "";
        const currentValue = readEnvOverridesSetting()[item.key] ?? item.defaultValue ?? "";
        if (nextValue === currentValue) {
          const message = buildEnvOverrideHint(item, currentValue, "配置未变化");
          setEnvOverridesHint(message);
          showToast("配置未变化");
          return;
        }
        try {
          const settings = await saveAppSettingsPatch({
            envOverrides: {
              [item.key]: nextValue,
            },
          });
          const resolved = normalizeEnvOverrides(settings.envOverrides);
          saveEnvOverridesSetting(resolved);
          renderEnvOverrideEditor(
            item.key,
            buildEnvOverrideHint(
              findEnvOverrideCatalogItem(item.key, normalizeEnvOverrideCatalog(settings.envOverrideCatalog))
                || item,
              resolved[item.key] ?? nextValue,
              "已保存",
            ),
          );
          showToast("高级环境变量已保存");
        } catch (err) {
          setEnvOverridesHint(`保存失败：${normalizeErrorMessage(err)}`);
          showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
        }
      });
    });
  }

  if (dom.envOverrideReset && dom.envOverrideReset.dataset.bound !== "1") {
    dom.envOverrideReset.dataset.bound = "1";
    dom.envOverrideReset.addEventListener("click", () => {
      void withButtonBusy(dom.envOverrideReset, "恢复中...", async () => {
        const item = findEnvOverrideCatalogItem(getEnvOverrideSelectedKey());
        if (!item) {
          const message = "请先选择一个环境变量";
          setEnvOverridesHint(message);
          showToast(message, "error");
          return;
        }
        try {
          const settings = await saveAppSettingsPatch({
            envOverrides: {
              [item.key]: "",
            },
          });
          const resolved = normalizeEnvOverrides(settings.envOverrides);
          saveEnvOverridesSetting(resolved);
          renderEnvOverrideEditor(
            item.key,
            buildEnvOverrideHint(item, resolved[item.key] ?? item.defaultValue ?? "", "已恢复默认"),
          );
          showToast("已恢复默认值");
        } catch (err) {
          setEnvOverridesHint(`恢复默认失败：${normalizeErrorMessage(err)}`);
          showToast(`恢复默认失败：${normalizeErrorMessage(err)}`, "error");
        }
      });
    });
  }

  if (dom.envOverrideSearchInput && dom.envOverrideSearchInput.dataset.bound !== "1") {
    dom.envOverrideSearchInput.dataset.bound = "1";
    dom.envOverrideSearchInput.addEventListener("input", () => {
      renderEnvOverrideEditor("");
    });
  }

  if (dom.envOverrideSelect && dom.envOverrideSelect.dataset.bound !== "1") {
    dom.envOverrideSelect.dataset.bound = "1";
    dom.envOverrideSelect.addEventListener("change", () => {
      renderEnvOverrideEditor(dom.envOverrideSelect ? dom.envOverrideSelect.value : "");
    });
  }

  if (dom.envOverrideValueInput && dom.envOverrideValueInput.dataset.bound !== "1") {
    dom.envOverrideValueInput.dataset.bound = "1";
    dom.envOverrideValueInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      dom.envOverridesSave?.click();
    });
  }

  if (dom.serviceAddrInput && dom.serviceAddrInput.dataset.bound !== "1") {
    dom.serviceAddrInput.dataset.bound = "1";
    dom.serviceAddrInput.addEventListener("change", () => {
      void persistServiceAddrInput({ silent: false });
    });
    dom.serviceAddrInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      void persistServiceAddrInput({ silent: false });
    });
  }

  const lowTransparencyToggle = typeof document === "undefined"
    ? null
    : document.getElementById(uiLowTransparencyToggleId);
  if (lowTransparencyToggle && lowTransparencyToggle.dataset.bound !== "1") {
    lowTransparencyToggle.dataset.bound = "1";
    lowTransparencyToggle.addEventListener("change", () => {
      const previousEnabled = readLowTransparencySetting();
      const enabled = Boolean(lowTransparencyToggle.checked);
      saveLowTransparencySetting(enabled);
      applyLowTransparencySetting(enabled);
      void saveAppSettingsPatch({
        lowTransparency: enabled,
      }).catch((err) => {
        saveLowTransparencySetting(previousEnabled);
        lowTransparencyToggle.checked = previousEnabled;
        applyLowTransparencySetting(previousEnabled);
        showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
      });
    });
  }

  const syncPairs = [
    [dom.webAccessPasswordInput, "settings"],
    [dom.webAccessPasswordConfirm, "settings"],
    [dom.webAccessPasswordQuickInput, "quick"],
    [dom.webAccessPasswordQuickConfirm, "quick"],
  ];
  for (const [input, source] of syncPairs) {
    if (!input || input.dataset.bound === "1") {
      continue;
    }
    input.dataset.bound = "1";
    input.addEventListener("input", () => {
      syncWebAccessPasswordInputs(source);
    });
  }

  if (dom.webAccessPasswordSave && dom.webAccessPasswordSave.dataset.bound !== "1") {
    dom.webAccessPasswordSave.dataset.bound = "1";
    dom.webAccessPasswordSave.addEventListener("click", () => {
      void withButtonBusy(dom.webAccessPasswordSave, "保存中...", async () => {
        await saveWebAccessPassword("settings");
      });
    });
  }

  if (dom.webAccessPasswordClear && dom.webAccessPasswordClear.dataset.bound !== "1") {
    dom.webAccessPasswordClear.dataset.bound = "1";
    dom.webAccessPasswordClear.addEventListener("click", () => {
      void withButtonBusy(dom.webAccessPasswordClear, "清除中...", async () => {
        await clearWebAccessPassword("settings");
      });
    });
  }

  if (dom.webAccessPasswordQuickSave && dom.webAccessPasswordQuickSave.dataset.bound !== "1") {
    dom.webAccessPasswordQuickSave.dataset.bound = "1";
    dom.webAccessPasswordQuickSave.addEventListener("click", () => {
      void withButtonBusy(dom.webAccessPasswordQuickSave, "保存中...", async () => {
        await saveWebAccessPassword("quick");
      });
    });
  }

  if (dom.webAccessPasswordQuickClear && dom.webAccessPasswordQuickClear.dataset.bound !== "1") {
    dom.webAccessPasswordQuickClear.dataset.bound = "1";
    dom.webAccessPasswordQuickClear.addEventListener("click", () => {
      void withButtonBusy(dom.webAccessPasswordQuickClear, "清除中...", async () => {
        await clearWebAccessPassword("quick");
      });
    });
  }

  if (dom.webSecurityQuickAction && dom.webSecurityQuickAction.dataset.bound !== "1") {
    dom.webSecurityQuickAction.dataset.bound = "1";
    dom.webSecurityQuickAction.addEventListener("click", () => {
      openWebSecurityModal();
    });
  }

  if (dom.closeWebSecurityModal && dom.closeWebSecurityModal.dataset.bound !== "1") {
    dom.closeWebSecurityModal.dataset.bound = "1";
    dom.closeWebSecurityModal.addEventListener("click", () => {
      closeWebSecurityModal();
    });
  }

  if (dom.modalWebSecurity && dom.modalWebSecurity.dataset.bound !== "1") {
    dom.modalWebSecurity.dataset.bound = "1";
    dom.modalWebSecurity.addEventListener("click", (event) => {
      if (event.target === dom.modalWebSecurity) {
        closeWebSecurityModal();
      }
    });
  }

  if (typeof document !== "undefined" && document.body && document.body.dataset.webSecurityBound !== "1") {
    document.body.dataset.webSecurityBound = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dom.modalWebSecurity?.classList.contains("active")) {
        closeWebSecurityModal();
      }
    });
  }
}
