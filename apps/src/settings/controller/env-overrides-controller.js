export function createEnvOverridesController(deps = {}) {
  const {
    dom = {},
    getDocumentRef = () => null,
    patchAppSettingsSnapshot,
    getAppSettingsSnapshot,
    buildEnvOverrideDescription,
    buildEnvOverrideOptionLabel,
    filterEnvOverrideCatalog,
    formatEnvOverrideDisplayValue,
    normalizeEnvOverrideCatalog,
    normalizeEnvOverrides,
  } = deps;

  let envOverrideSelectedKey = "";

  function readEnvOverridesSetting() {
    return normalizeEnvOverrides(getAppSettingsSnapshot().envOverrides);
  }

  function saveEnvOverridesSetting(value) {
    patchAppSettingsSnapshot({
      envOverrides: normalizeEnvOverrides(value),
    });
  }

  function setEnvOverridesHint(message) {
    if (!dom.envOverridesHint) {
      return;
    }
    dom.envOverridesHint.textContent = String(message || "").trim()
      || "选择变量后可直接修改值；恢复默认会回退到启动时环境值或内置默认值。";
  }

  function setEnvOverrideDescription(message) {
    if (!dom.envOverrideDescription) {
      return;
    }
    dom.envOverrideDescription.textContent = String(message || "").trim()
      || "这里会显示当前变量的作用说明。";
  }

  function readEnvOverrideCatalog() {
    const reservedKeys = new Set(
      (Array.isArray(getAppSettingsSnapshot().envOverrideReservedKeys)
        ? getAppSettingsSnapshot().envOverrideReservedKeys
        : [])
        .map((item) => String(item || "").trim().toUpperCase())
        .filter(Boolean),
    );
    return normalizeEnvOverrideCatalog(getAppSettingsSnapshot().envOverrideCatalog)
      .filter((item) => !reservedKeys.has(item.key));
  }

  function findEnvOverrideCatalogItem(key, catalog = readEnvOverrideCatalog()) {
    const normalizedKey = String(key || "").trim().toUpperCase();
    return catalog.find((item) => item.key === normalizedKey) || null;
  }

  function resolveEnvOverrideSelection(preferredKey) {
    const catalog = filterEnvOverrideCatalog(
      readEnvOverrideCatalog(),
      dom.envOverrideSearchInput ? dom.envOverrideSearchInput.value : "",
    );
    const nextKey = [preferredKey, envOverrideSelectedKey]
      .map((item) => String(item || "").trim().toUpperCase())
      .find((key) => key && catalog.some((item) => item.key === key))
      || (catalog[0] ? catalog[0].key : "");

    envOverrideSelectedKey = nextKey;
    return {
      catalog,
      selectedItem: catalog.find((item) => item.key === nextKey) || null,
    };
  }

  function buildEnvOverrideHint(item, currentValue, prefix = "") {
    if (!item) {
      return prefix || "请输入搜索词并从下拉中选择一个变量。";
    }
    const scopeLabel = item.scope === "web"
      ? "Web"
      : item.scope === "desktop"
        ? "桌面端"
        : "服务端";
    const parts = [];
    if (prefix) {
      parts.push(prefix);
    }
    parts.push(`默认值：${formatEnvOverrideDisplayValue(item.defaultValue)}`);
    parts.push(`当前值：${formatEnvOverrideDisplayValue(currentValue)}`);
    parts.push(`作用域：${scopeLabel}`);
    parts.push(item.applyMode === "restart" ? "保存后需重启相关进程" : "保存后热生效");
    return parts.join("；");
  }

  function renderEnvOverrideSelector(preferredKey = envOverrideSelectedKey) {
    const { catalog, selectedItem } = resolveEnvOverrideSelection(preferredKey);
    if (!dom.envOverrideSelect) {
      return selectedItem;
    }

    const doc = getDocumentRef();
    if (!doc) {
      return selectedItem;
    }

    dom.envOverrideSelect.replaceChildren();
    if (catalog.length === 0) {
      const option = doc.createElement("option");
      option.value = "";
      option.textContent = "未匹配到变量";
      dom.envOverrideSelect.appendChild(option);
      dom.envOverrideSelect.disabled = true;
      dom.envOverrideSelect.value = "";
      return null;
    }

    for (const item of catalog) {
      const option = doc.createElement("option");
      option.value = item.key;
      option.textContent = buildEnvOverrideOptionLabel(item);
      dom.envOverrideSelect.appendChild(option);
    }
    dom.envOverrideSelect.disabled = false;
    dom.envOverrideSelect.value = selectedItem ? selectedItem.key : catalog[0].key;
    return selectedItem;
  }

  function renderEnvOverrideEditor(preferredKey = envOverrideSelectedKey, hint = "") {
    const item = renderEnvOverrideSelector(preferredKey);
    const overrides = readEnvOverridesSetting();
    const currentValue = item ? (overrides[item.key] ?? item.defaultValue ?? "") : "";

    if (dom.envOverrideNameValue) {
      dom.envOverrideNameValue.textContent = item ? item.label : "未选择";
    }
    if (dom.envOverrideKeyValue) {
      dom.envOverrideKeyValue.textContent = item ? item.key : "-";
    }
    if (dom.envOverrideMeta) {
      const scopeLabel = item?.scope === "web"
        ? "Web"
        : item?.scope === "desktop"
          ? "桌面端"
          : "服务端";
      dom.envOverrideMeta.textContent = item
        ? `${scopeLabel} · ${item.applyMode === "restart" ? "重启生效" : "热生效"}`
        : "请先选择变量";
    }
    if (dom.envOverrideValueInput) {
      dom.envOverrideValueInput.disabled = !item;
      dom.envOverrideValueInput.value = item ? currentValue : "";
      dom.envOverrideValueInput.placeholder = item
        ? "留空并保存可恢复默认值"
        : "请先选择变量";
    }
    if (dom.envOverridesSave) {
      dom.envOverridesSave.disabled = !item;
    }
    if (dom.envOverrideReset) {
      dom.envOverrideReset.disabled = !item;
    }

    setEnvOverridesHint(hint || buildEnvOverrideHint(item, currentValue));
    setEnvOverrideDescription(buildEnvOverrideDescription(item));
    return item;
  }

  function initEnvOverridesSetting() {
    envOverrideSelectedKey = "";
    renderEnvOverrideEditor("", "选择变量后可直接修改值；恢复默认会回退到启动时环境值或内置默认值。");
  }

  return {
    getEnvOverrideSelectedKey: () => envOverrideSelectedKey,
    findEnvOverrideCatalogItem,
    setEnvOverridesHint,
    readEnvOverridesSetting,
    buildEnvOverrideHint,
    saveEnvOverridesSetting,
    renderEnvOverrideEditor,
    initEnvOverridesSetting,
  };
}
