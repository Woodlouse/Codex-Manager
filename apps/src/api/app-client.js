import { invoke, invokeFirst, isTauriRuntime, rpcInvoke } from "./transport.js";

export async function openInBrowser(url) {
  if (!isTauriRuntime()) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
  return invoke("open_in_browser", { url });
}

export async function appCloseToTrayOnCloseGet() {
  if (!isTauriRuntime()) {
    return false;
  }
  const value = await invoke("app_close_to_tray_on_close_get", {});
  return value === true;
}

export async function appCloseToTrayOnCloseSet(enabled) {
  if (!isTauriRuntime()) {
    return false;
  }
  const value = await invoke("app_close_to_tray_on_close_set", { enabled: Boolean(enabled) });
  return value === true;
}

export async function appSettingsGet() {
  if (!isTauriRuntime()) {
    return rpcInvoke("appSettings/get");
  }
  return invoke("app_settings_get", {});
}

export async function appSettingsSet(patch = {}) {
  const payload = patch && typeof patch === "object" ? patch : {};
  if (!isTauriRuntime()) {
    return rpcInvoke("appSettings/set", payload);
  }
  return invoke("app_settings_set", { patch: payload });
}

export async function updateCheck() {
  if (!isTauriRuntime()) {
    throw new Error("浏览器模式不支持桌面端更新");
  }
  return invokeFirst(["app_update_check", "update_check", "check_update"], {});
}

export async function updateDownload(payload = {}) {
  if (!isTauriRuntime()) {
    throw new Error("浏览器模式不支持桌面端更新");
  }
  return invokeFirst(["app_update_prepare", "update_download", "download_update"], payload);
}

export async function updateInstall(payload = {}) {
  if (!isTauriRuntime()) {
    throw new Error("浏览器模式不支持桌面端更新");
  }
  return invokeFirst(["app_update_launch_installer", "update_install", "install_update"], payload);
}

export async function updateRestart(payload = {}) {
  if (!isTauriRuntime()) {
    throw new Error("浏览器模式不支持桌面端更新");
  }
  return invokeFirst(["app_update_apply_portable", "update_restart", "restart_update"], payload);
}

export async function updateStatus() {
  if (!isTauriRuntime()) {
    throw new Error("浏览器模式不支持桌面端更新");
  }
  return invokeFirst(["app_update_status", "update_status"], {});
}
