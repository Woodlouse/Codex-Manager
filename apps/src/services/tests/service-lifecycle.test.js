import test from "node:test";
import assert from "node:assert/strict";

import { createServiceLifecycle } from "../service-lifecycle.js";

function createDomStub() {
  return {
    serviceToggleBtn: {
      checked: false,
      disabled: false,
      ariaChecked: "false",
      classList: {
        toggle() {},
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      addEventListener() {},
    },
    serviceToggleText: {
      textContent: "",
    },
    serviceAddrInput: {
      value: "48760",
    },
  };
}

test("autoStartService prefers startup hydration over refreshAll", async () => {
  const calls = [];
  const state = {
    serviceAddr: "",
    serviceConnected: false,
    serviceBusy: false,
    serviceProbeId: 0,
    serviceLastError: "",
    autoRefreshTimer: null,
  };
  const dom = createDomStub();

  const lifecycle = createServiceLifecycle({
    state,
    dom,
    setServiceHint: () => {},
    normalizeAddr: (value) => `localhost:${String(value).replace("localhost:", "")}`,
    startService: async () => true,
    stopService: async () => {},
    waitForConnection: async () => {
      state.serviceConnected = true;
      return true;
    },
    refreshAll: async () => {
      calls.push("refreshAll");
    },
    hydrateStartupData: async () => {
      calls.push("hydrateStartupData");
    },
    maybeRefreshApiModelsCache: async () => {
      calls.push("maybeRefreshApiModelsCache");
    },
    ensureAutoRefreshTimer: () => {
      calls.push("ensureAutoRefreshTimer");
      state.autoRefreshTimer = 1;
      return true;
    },
    stopAutoRefreshTimer: () => {
      state.autoRefreshTimer = null;
      return true;
    },
    onStartupState: () => {},
  });

  const started = await lifecycle.autoStartService();

  assert.equal(started, true);
  assert.deepEqual(calls, [
    "hydrateStartupData",
    "maybeRefreshApiModelsCache",
    "ensureAutoRefreshTimer",
  ]);
});
