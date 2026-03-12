import test from "node:test";
import assert from "node:assert/strict";

import { createUpdateController, normalizeUpdateInfo } from "../update-controller.js";

test("normalizeUpdateInfo infers available version and portable package hints", () => {
  const info = normalizeUpdateInfo({
    result: {
      latestVersion: "0.1.8",
      packageType: "portable",
      canPrepare: true,
    },
  });

  assert.equal(info.available, true);
  assert.equal(info.version, "0.1.8");
  assert.equal(info.isPortable, true);
  assert.equal(info.canPrepare, true);
});

test("handleCheckUpdateClick updates button label when a new version can be prepared", async () => {
  const dom = {
    checkUpdate: {
      textContent: "",
    },
    updateStatusText: {
      textContent: "",
    },
    updateCurrentVersion: {
      textContent: "",
    },
  };
  const toasts = [];
  const controller = createUpdateController({
    dom,
    showToast: (message) => {
      toasts.push(message);
    },
    isTauriRuntime: () => true,
    readUpdateAutoCheckSetting: () => false,
    updateCheck: async () => ({
      available: true,
      latestVersion: "0.1.8",
      canPrepare: true,
      packageType: "portable",
    }),
    withButtonBusy: async (_button, _text, task) => task(),
  });

  await controller.handleCheckUpdateClick();

  assert.equal(dom.checkUpdate.textContent, "更新到 v0.1.8");
  assert.equal(dom.updateStatusText.textContent, "发现新版本 v0.1.8，再次点击可更新");
  assert.equal(toasts.at(-1), "发现新版本 v0.1.8，再次点击可更新");
});
