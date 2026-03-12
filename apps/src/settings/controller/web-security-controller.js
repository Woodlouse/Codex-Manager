export function createWebSecurityController(deps = {}) {
  const {
    dom = {},
    showToast = () => {},
    normalizeErrorMessage = (err) => String(err?.message || err || ""),
    saveAppSettingsPatch,
    patchAppSettingsSnapshot,
    getAppSettingsSnapshot,
  } = deps;

  function buildWebAccessPasswordStatusText(configured) {
    return configured
      ? "当前已启用 Web 访问密码。修改后会立即覆盖旧密码。"
      : "当前未启用 Web 访问密码。";
  }

  function updateWebAccessPasswordState(configured) {
    const enabled = Boolean(configured);
    patchAppSettingsSnapshot({ webAccessPasswordConfigured: enabled });
    const text = buildWebAccessPasswordStatusText(enabled);
    if (dom.webAccessPasswordHint) {
      dom.webAccessPasswordHint.textContent = text;
    }
    if (dom.webAccessPasswordQuickStatus) {
      dom.webAccessPasswordQuickStatus.textContent = text;
    }
  }

  function readWebAccessPasswordPair(source = "settings") {
    const useQuick = source === "quick";
    const password = useQuick
      ? (dom.webAccessPasswordQuickInput ? dom.webAccessPasswordQuickInput.value : "")
      : (dom.webAccessPasswordInput ? dom.webAccessPasswordInput.value : "");
    const confirm = useQuick
      ? (dom.webAccessPasswordQuickConfirm ? dom.webAccessPasswordQuickConfirm.value : "")
      : (dom.webAccessPasswordConfirm ? dom.webAccessPasswordConfirm.value : "");
    return {
      password: String(password || ""),
      confirm: String(confirm || ""),
    };
  }

  function syncWebAccessPasswordInputs(source = "settings") {
    const pair = readWebAccessPasswordPair(source);
    if (dom.webAccessPasswordInput) {
      dom.webAccessPasswordInput.value = pair.password;
    }
    if (dom.webAccessPasswordConfirm) {
      dom.webAccessPasswordConfirm.value = pair.confirm;
    }
    if (dom.webAccessPasswordQuickInput) {
      dom.webAccessPasswordQuickInput.value = pair.password;
    }
    if (dom.webAccessPasswordQuickConfirm) {
      dom.webAccessPasswordQuickConfirm.value = pair.confirm;
    }
  }

  function clearWebAccessPasswordInputs() {
    if (dom.webAccessPasswordInput) {
      dom.webAccessPasswordInput.value = "";
    }
    if (dom.webAccessPasswordConfirm) {
      dom.webAccessPasswordConfirm.value = "";
    }
    if (dom.webAccessPasswordQuickInput) {
      dom.webAccessPasswordQuickInput.value = "";
    }
    if (dom.webAccessPasswordQuickConfirm) {
      dom.webAccessPasswordQuickConfirm.value = "";
    }
  }

  function openWebSecurityModal() {
    if (!dom.modalWebSecurity) {
      return;
    }
    syncWebAccessPasswordInputs("settings");
    updateWebAccessPasswordState(getAppSettingsSnapshot().webAccessPasswordConfigured);
    dom.modalWebSecurity.classList.add("active");
  }

  function closeWebSecurityModal() {
    if (!dom.modalWebSecurity) {
      return;
    }
    dom.modalWebSecurity.classList.remove("active");
  }

  async function saveWebAccessPassword(source = "settings") {
    const pair = readWebAccessPasswordPair(source);
    const password = pair.password.trim();
    if (!password) {
      showToast("请输入 Web 访问密码；如需关闭保护请点击清除", "error");
      return false;
    }
    if (pair.password !== pair.confirm) {
      showToast("两次输入的 Web 访问密码不一致", "error");
      return false;
    }
    try {
      const settings = await saveAppSettingsPatch({
        webAccessPassword: pair.password,
      });
      updateWebAccessPasswordState(settings.webAccessPasswordConfigured);
      clearWebAccessPasswordInputs();
      if (source === "quick") {
        closeWebSecurityModal();
      }
      showToast("Web 访问密码已保存");
      return true;
    } catch (err) {
      showToast(`保存失败：${normalizeErrorMessage(err)}`, "error");
      return false;
    }
  }

  async function clearWebAccessPassword(source = "settings") {
    try {
      const settings = await saveAppSettingsPatch({
        webAccessPassword: "",
      });
      updateWebAccessPasswordState(settings.webAccessPasswordConfigured);
      clearWebAccessPasswordInputs();
      if (source === "quick") {
        closeWebSecurityModal();
      }
      showToast("Web 访问密码已清除");
      return true;
    } catch (err) {
      showToast(`清除失败：${normalizeErrorMessage(err)}`, "error");
      return false;
    }
  }

  return {
    updateWebAccessPasswordState,
    syncWebAccessPasswordInputs,
    saveWebAccessPassword,
    clearWebAccessPassword,
    openWebSecurityModal,
    closeWebSecurityModal,
  };
}
