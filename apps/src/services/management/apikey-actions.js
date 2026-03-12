import * as api from "../../api.js";
import { copyText } from "../../utils/clipboard.js";

export function createApiKeyActions({
  dom,
  ensureConnected,
  withButtonBusy,
  showToast,
  showConfirmDialog,
  refreshApiModels,
  refreshApiKeys,
  populateApiKeyModelSelect,
  renderApiKeys,
  closeApiKeyModal,
  apiClient = api,
}) {
  let actions = null;

  const renderApiKeyList = () => {
    renderApiKeys({
      onToggleStatus: actions.toggleApiKeyStatus,
      onDelete: actions.deleteApiKey,
      onUpdateModel: actions.updateApiKeyModel,
    });
  };

  const refreshApiKeyList = async () => {
    try {
      await refreshApiKeys();
      renderApiKeyList();
      return true;
    } catch (err) {
      showToast(`平台密钥刷新失败：${err instanceof Error ? err.message : String(err)}`, "error");
      return false;
    }
  };

  async function refreshApiModelsNow(options = {}) {
    const silent = options && options.silent === true;
    const hasButtonOption = options && Object.prototype.hasOwnProperty.call(options, "button");
    const busyTarget = hasButtonOption ? options.button : dom.refreshApiModelsBtn;
    const runner = async () => {
      const ok = await ensureConnected();
      if (!ok) return false;
      await refreshApiModels({ refreshRemote: true });
      populateApiKeyModelSelect();
      renderApiKeyList();
      if (!silent) {
        showToast("模型列表已刷新");
      }
      return true;
    };

    if (busyTarget) {
      return withButtonBusy(busyTarget, "刷新中...", runner);
    }
    return runner();
  }

  async function createApiKey() {
    await withButtonBusy(dom.submitApiKey, "创建中...", async () => {
      const ok = await ensureConnected();
      if (!ok) return;
      const modelSlug = dom.inputApiKeyModel.value || null;
      const reasoningEffort = modelSlug ? (dom.inputApiKeyReasoning.value || null) : null;
      const protocolType = dom.inputApiKeyProtocol?.value || "openai_compat";
      const isAzureProtocol = protocolType === "azure_openai";
      const upstreamBaseUrl = isAzureProtocol ? (dom.inputApiKeyEndpoint?.value.trim() || null) : null;
      const azureApiKey = isAzureProtocol ? (dom.inputApiKeyAzureApiKey?.value.trim() || null) : null;
      const staticHeadersJson = isAzureProtocol && azureApiKey
        ? JSON.stringify({ "api-key": azureApiKey })
        : null;
      const res = await apiClient.serviceApiKeyCreate(
        dom.inputApiKeyName.value.trim() || null,
        modelSlug,
        reasoningEffort,
        {
          protocolType,
          upstreamBaseUrl,
          staticHeadersJson,
        },
      );
      if (res && res.error) {
        showToast(res.error, "error");
        return;
      }
      dom.apiKeyValue.value = res && res.key ? res.key : "";
      closeApiKeyModal?.();
      if (await refreshApiKeyList()) {
        showToast("平台密钥创建成功");
      } else {
        showToast("平台密钥已创建，但列表刷新失败", "error");
      }
    });
  }

  async function deleteApiKey(item) {
    if (!item || !item.id) return;
    const confirmed = await showConfirmDialog({
      title: "删除平台密钥",
      message: `确定删除平台密钥 ${item.id} 吗？`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!confirmed) return;
    const ok = await ensureConnected();
    if (!ok) return;
    const res = await apiClient.serviceApiKeyDelete(item.id);
    if (res && res.ok === false) {
      showToast(res.error || "平台密钥删除失败", "error");
      return;
    }
    if (await refreshApiKeyList()) {
      showToast("平台密钥已删除");
    }
  }

  async function toggleApiKeyStatus(item) {
    if (!item || !item.id) return;
    const ok = await ensureConnected();
    if (!ok) return;
    const isDisabled = String(item.status || "").toLowerCase() === "disabled";
    let result;
    if (isDisabled) {
      result = await apiClient.serviceApiKeyEnable(item.id);
    } else {
      result = await apiClient.serviceApiKeyDisable(item.id);
    }
    if (result && result.ok === false) {
      showToast(result.error || "平台密钥状态更新失败", "error");
      return;
    }
    if (await refreshApiKeyList()) {
      showToast(isDisabled ? "平台密钥已启用" : "平台密钥已禁用");
    }
  }

  async function updateApiKeyModel(item, modelSlug, reasoningEffort) {
    if (!item || !item.id) return;
    const ok = await ensureConnected();
    if (!ok) return;
    const normalizedModel = modelSlug || null;
    const normalizedEffort = normalizedModel ? (reasoningEffort || null) : null;
    const res = await apiClient.serviceApiKeyUpdateModel(item.id, normalizedModel, normalizedEffort, {
      protocolType: item.protocolType || "openai_compat",
      upstreamBaseUrl: item.upstreamBaseUrl || null,
      staticHeadersJson: item.staticHeadersJson || null,
    });
    if (res && res.ok === false) {
      showToast(res.error || "模型配置保存失败", "error");
      return;
    }
    await refreshApiKeyList();
  }

  async function copyApiKey(item, button) {
    if (!item || !item.id) return;
    await withButtonBusy(button, "复制中...", async () => {
      const ok = await ensureConnected();
      if (!ok) return;
      const res = await apiClient.serviceApiKeyReadSecret(item.id);
      const secret = res && typeof res.key === "string" ? res.key.trim() : "";
      if (!secret) {
        showToast("该密钥创建于旧版本，无法找回明文，请删除后重新创建", "error");
        return;
      }
      const copied = await copyText(secret);
      if (copied) {
        showToast("完整密钥已复制");
      } else {
        showToast("复制失败，请重试", "error");
      }
    });
  }

  actions = {
    createApiKey,
    deleteApiKey,
    toggleApiKeyStatus,
    updateApiKeyModel,
    copyApiKey,
    refreshApiModelsNow,
  };
  return actions;
}


