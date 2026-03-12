import {
  UI_LOW_TRANSPARENCY_BODY_CLASS,
  UI_LOW_TRANSPARENCY_CARD_ID,
  UI_LOW_TRANSPARENCY_TOGGLE_ID,
} from "./shared.js";

export function createUiPreferencesController(deps = {}) {
  const {
    dom = {},
    showToast = () => {},
    normalizeErrorMessage = (err) => String(err?.message || err || ""),
    isTauriRuntime = () => false,
    getDocumentRef = () => null,
    saveAppSettingsPatch,
    patchAppSettingsSnapshot,
    getAppSettingsSnapshot,
  } = deps;

  function applyBrowserModeUi() {
    if (isTauriRuntime()) {
      return false;
    }
    const doc = getDocumentRef();
    if (doc?.body) {
      doc.body.classList.add("cm-browser");
    }

    const serviceSetup = dom.serviceAddrInput ? dom.serviceAddrInput.closest(".service-setup") : null;
    if (serviceSetup) {
      serviceSetup.style.display = "none";
    }
    const updateCard = dom.checkUpdate
      ? dom.checkUpdate.closest(".settings-top-item, .settings-card")
      : null;
    if (updateCard) {
      updateCard.style.display = "none";
    }
    const closeToTrayCard = dom.closeToTrayOnClose
      ? dom.closeToTrayOnClose.closest(".settings-top-item, .settings-card")
      : null;
    if (closeToTrayCard) {
      closeToTrayCard.style.display = "none";
    }
    const lightweightModeCard = dom.lightweightModeOnCloseToTray
      ? dom.lightweightModeOnCloseToTray.closest(".settings-top-item, .settings-card")
      : null;
    if (lightweightModeCard) {
      lightweightModeCard.style.display = "none";
    }

    return true;
  }

  function readUpdateAutoCheckSetting() {
    return Boolean(getAppSettingsSnapshot().updateAutoCheck);
  }

  function saveUpdateAutoCheckSetting(enabled) {
    patchAppSettingsSnapshot({ updateAutoCheck: Boolean(enabled) });
  }

  function initUpdateAutoCheckSetting() {
    const enabled = readUpdateAutoCheckSetting();
    if (dom.autoCheckUpdate) {
      dom.autoCheckUpdate.checked = enabled;
    }
  }

  function readCloseToTrayOnCloseSetting() {
    return Boolean(getAppSettingsSnapshot().closeToTrayOnClose);
  }

  function saveCloseToTrayOnCloseSetting(enabled) {
    patchAppSettingsSnapshot({ closeToTrayOnClose: Boolean(enabled) });
  }

  function setCloseToTrayOnCloseToggle(enabled) {
    if (dom.closeToTrayOnClose) {
      dom.closeToTrayOnClose.checked = Boolean(enabled);
    }
  }

  function readLightweightModeOnCloseToTraySetting() {
    return Boolean(getAppSettingsSnapshot().lightweightModeOnCloseToTray);
  }

  function saveLightweightModeOnCloseToTraySetting(enabled) {
    patchAppSettingsSnapshot({ lightweightModeOnCloseToTray: Boolean(enabled) });
  }

  function setLightweightModeOnCloseToTrayToggle(enabled) {
    if (dom.lightweightModeOnCloseToTray) {
      dom.lightweightModeOnCloseToTray.checked = Boolean(enabled);
    }
  }

  function syncLightweightModeOnCloseToTrayAvailability() {
    if (!dom.lightweightModeOnCloseToTray) {
      return;
    }
    const snapshot = getAppSettingsSnapshot();
    dom.lightweightModeOnCloseToTray.disabled = !Boolean(snapshot.closeToTraySupported)
      || !Boolean(snapshot.closeToTrayOnClose);
  }

  async function applyCloseToTrayOnCloseSetting(enabled, { silent = true } = {}) {
    const normalized = Boolean(enabled);
    try {
      const settings = await saveAppSettingsPatch({
        closeToTrayOnClose: normalized,
      });
      const applied = Boolean(settings.closeToTrayOnClose);
      const supported = Boolean(settings.closeToTraySupported);
      if (dom.closeToTrayOnClose) {
        dom.closeToTrayOnClose.disabled = !supported;
      }
      saveCloseToTrayOnCloseSetting(applied);
      setCloseToTrayOnCloseToggle(applied);
      syncLightweightModeOnCloseToTrayAvailability();
      if (!silent) {
        if (normalized && !applied && !supported) {
          showToast("系统托盘不可用，无法启用关闭时最小化到托盘", "error");
        } else {
          showToast(applied ? "已开启：关闭窗口将最小化到托盘" : "已关闭：关闭窗口将直接退出");
        }
      }
      return Boolean(applied);
    } catch (err) {
      if (!silent) {
        showToast(`设置失败：${normalizeErrorMessage(err)}`, "error");
      }
      throw err;
    }
  }

  function initCloseToTrayOnCloseSetting() {
    const enabled = readCloseToTrayOnCloseSetting();
    setCloseToTrayOnCloseToggle(enabled);
    if (dom.closeToTrayOnClose) {
      dom.closeToTrayOnClose.disabled = !Boolean(getAppSettingsSnapshot().closeToTraySupported);
    }
    syncLightweightModeOnCloseToTrayAvailability();
  }

  async function applyLightweightModeOnCloseToTraySetting(enabled, { silent = true } = {}) {
    const normalized = Boolean(enabled);
    try {
      const settings = await saveAppSettingsPatch({
        lightweightModeOnCloseToTray: normalized,
      });
      const applied = Boolean(settings.lightweightModeOnCloseToTray);
      saveLightweightModeOnCloseToTraySetting(applied);
      setLightweightModeOnCloseToTrayToggle(applied);
      syncLightweightModeOnCloseToTrayAvailability();
      if (!silent) {
        showToast(
          applied
            ? "已开启：关闭到托盘时会释放窗口内存，再次打开会稍慢"
            : "已关闭：托盘隐藏时继续保留窗口内存，再次打开更快",
        );
      }
      return applied;
    } catch (err) {
      if (!silent) {
        showToast(`设置失败：${normalizeErrorMessage(err)}`, "error");
      }
      throw err;
    }
  }

  function initLightweightModeOnCloseToTraySetting() {
    const enabled = readLightweightModeOnCloseToTraySetting();
    setLightweightModeOnCloseToTrayToggle(enabled);
    syncLightweightModeOnCloseToTrayAvailability();
  }

  function readLowTransparencySetting() {
    return Boolean(getAppSettingsSnapshot().lowTransparency);
  }

  function saveLowTransparencySetting(enabled) {
    patchAppSettingsSnapshot({ lowTransparency: Boolean(enabled) });
  }

  function applyLowTransparencySetting(enabled) {
    const doc = getDocumentRef();
    if (!doc?.body) {
      return;
    }
    doc.body.classList.toggle(UI_LOW_TRANSPARENCY_BODY_CLASS, enabled);
  }

  function ensureLowTransparencySettingCard() {
    const doc = getDocumentRef();
    if (!doc) {
      return null;
    }
    const existing = doc.getElementById(UI_LOW_TRANSPARENCY_TOGGLE_ID);
    if (existing) {
      return existing;
    }

    const settingsGrid = doc.querySelector("#pageSettings .settings-grid");
    if (!settingsGrid) {
      return null;
    }

    const existingCard = doc.getElementById(UI_LOW_TRANSPARENCY_CARD_ID);
    if (existingCard) {
      return doc.getElementById(UI_LOW_TRANSPARENCY_TOGGLE_ID);
    }

    const card = doc.createElement("div");
    card.className = "panel settings-card settings-card-span-2";
    card.id = UI_LOW_TRANSPARENCY_CARD_ID;
    card.innerHTML = `
    <div class="panel-header">
      <div>
        <h3>视觉性能</h3>
        <p>减少模糊/透明特效，降低掉帧</p>
      </div>
    </div>
    <div class="settings-row">
      <label class="update-auto-check switch-control" for="${UI_LOW_TRANSPARENCY_TOGGLE_ID}">
        <input id="${UI_LOW_TRANSPARENCY_TOGGLE_ID}" type="checkbox" />
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb"></span>
        </span>
        <span>性能模式/低透明度</span>
      </label>
    </div>
    <div class="hint">开启后会关闭/降级 blur、backdrop-filter 等效果（更省 GPU，但质感会更“硬”）。</div>
  `;

    const themeCard = doc.getElementById("themePanel")?.closest(".settings-card");
    if (themeCard && themeCard.parentElement === settingsGrid) {
      settingsGrid.insertBefore(card, themeCard);
    } else {
      settingsGrid.appendChild(card);
    }

    return doc.getElementById(UI_LOW_TRANSPARENCY_TOGGLE_ID);
  }

  function initLowTransparencySetting() {
    const enabled = readLowTransparencySetting();
    applyLowTransparencySetting(enabled);
    const toggle = ensureLowTransparencySettingCard();
    if (toggle) {
      toggle.checked = enabled;
    }
  }

  return {
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
    uiLowTransparencyToggleId: UI_LOW_TRANSPARENCY_TOGGLE_ID,
  };
}
