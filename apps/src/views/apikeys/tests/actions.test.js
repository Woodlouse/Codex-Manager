import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../../../state.js";
import { dom } from "../../../ui/dom.js";
import { populateApiKeyModelSelect } from "../actions.js";
import { createApiKeyActions } from "../../../services/management/apikey-actions.js";

class FakeSelect {
  constructor() {
    this._innerHTML = "";
    this.children = [];
    this.appendCount = 0;
    this.clearCount = 0;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
    this.clearCount += 1;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(node) {
    this.children.push(node);
    this.appendCount += 1;
    return node;
  }
}

test("populateApiKeyModelSelect only rebuilds model options when signature changes", () => {
  const previousDocument = globalThis.document;
  const previousModelSelect = dom.inputApiKeyModel;
  const previousReasoningSelect = dom.inputApiKeyReasoning;
  const previousModelOptions = state.apiModelOptions;

  globalThis.document = {
    createElement() {
      return { value: "", textContent: "" };
    },
  };

  const modelSelect = new FakeSelect();
  const reasoningSelect = new FakeSelect();
  dom.inputApiKeyModel = modelSelect;
  dom.inputApiKeyReasoning = reasoningSelect;
  state.apiModelOptions = [{ slug: "model-a", displayName: "Model A" }];

  try {
    populateApiKeyModelSelect({ force: true });
    const modelAppendAfterFirst = modelSelect.appendCount;
    const reasoningAppendAfterFirst = reasoningSelect.appendCount;
    assert.ok(modelAppendAfterFirst > 0);
    assert.ok(reasoningAppendAfterFirst > 0);

    populateApiKeyModelSelect();
    assert.equal(modelSelect.appendCount, modelAppendAfterFirst);
    assert.equal(reasoningSelect.appendCount, reasoningAppendAfterFirst);

    state.apiModelOptions = [
      { slug: "model-a", displayName: "Model A" },
      { slug: "model-b", displayName: "Model B" },
    ];
    populateApiKeyModelSelect();
    assert.ok(modelSelect.appendCount > modelAppendAfterFirst);
  } finally {
    globalThis.document = previousDocument;
    dom.inputApiKeyModel = previousModelSelect;
    dom.inputApiKeyReasoning = previousReasoningSelect;
    state.apiModelOptions = previousModelOptions;
  }
});

test("createApiKey closes modal after successful creation", async () => {
  const previousSubmit = dom.submitApiKey;
  const previousName = dom.inputApiKeyName;
  const previousModel = dom.inputApiKeyModel;
  const previousReasoning = dom.inputApiKeyReasoning;
  const previousProtocol = dom.inputApiKeyProtocol;
  const previousEndpoint = dom.inputApiKeyEndpoint;
  const previousAzureApiKey = dom.inputApiKeyAzureApiKey;
  const previousApiKeyValue = dom.apiKeyValue;

  let closed = 0;
  const calls = {
    create: 0,
    refreshKeys: 0,
    render: 0,
    toast: [],
  };

  dom.submitApiKey = {};
  dom.inputApiKeyName = { value: " 测试 Key " };
  dom.inputApiKeyModel = { value: "gpt-5.3-codex" };
  dom.inputApiKeyReasoning = { value: "high" };
  dom.inputApiKeyProtocol = { value: "openai_compat" };
  dom.inputApiKeyEndpoint = { value: "" };
  dom.inputApiKeyAzureApiKey = { value: "" };
  dom.apiKeyValue = { value: "" };

  const actions = createApiKeyActions({
    dom,
    ensureConnected: async () => true,
    withButtonBusy: async (_button, _label, task) => task(),
    showToast: (message, level = "info") => {
      calls.toast.push({ message, level });
    },
    showConfirmDialog: async () => true,
    refreshApiModels: async () => {},
    refreshApiKeys: async () => {
      calls.refreshKeys += 1;
    },
    populateApiKeyModelSelect: () => {},
    renderApiKeys: () => {
      calls.render += 1;
    },
    closeApiKeyModal: () => {
      closed += 1;
    },
    apiClient: {
      serviceApiKeyCreate: async () => {
        calls.create += 1;
        return { key: "sk-test" };
      },
      serviceApiKeyDelete: async () => ({ ok: true }),
      serviceApiKeyDisable: async () => ({ ok: true }),
      serviceApiKeyEnable: async () => ({ ok: true }),
      serviceApiKeyUpdateModel: async () => ({ ok: true }),
      serviceApiKeyReadSecret: async () => ({ key: "sk-test" }),
    },
  });

  try {
    await actions.createApiKey();
    assert.equal(calls.create, 1);
    assert.equal(dom.apiKeyValue.value, "sk-test");
    assert.equal(closed, 1);
    assert.equal(calls.refreshKeys, 1);
    assert.equal(calls.render, 1);
    assert.equal(calls.toast.at(-1)?.message, "平台密钥创建成功");
  } finally {
    dom.submitApiKey = previousSubmit;
    dom.inputApiKeyName = previousName;
    dom.inputApiKeyModel = previousModel;
    dom.inputApiKeyReasoning = previousReasoning;
    dom.inputApiKeyProtocol = previousProtocol;
    dom.inputApiKeyEndpoint = previousEndpoint;
    dom.inputApiKeyAzureApiKey = previousAzureApiKey;
    dom.apiKeyValue = previousApiKeyValue;
  }
});
