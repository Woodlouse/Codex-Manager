import test from "node:test";
import assert from "node:assert/strict";

import { serviceAccountExportByAccountFiles } from "../account-client.js";

test("serviceAccountExportByAccountFiles exports files through directory picker in browser mode", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const writtenFiles = new Map();

  globalThis.window = {
    showDirectoryPicker: async () => ({
      name: "exports",
      async getFileHandle(fileName) {
        return {
          async createWritable() {
            return {
              async write(content) {
                writtenFiles.set(fileName, String(content));
              },
              async close() {},
            };
          },
        };
      },
    }),
  };

  globalThis.fetch = async (url) => {
    assert.equal(url, "/api/rpc");
    return {
      ok: true,
      async json() {
        return {
          result: {
            totalAccounts: 2,
            exported: 1,
            skippedMissingToken: 1,
            files: [
              {
                fileName: "demo_account.json",
                content: "{\"tokens\":{\"access_token\":\"abc\"}}",
              },
            ],
          },
        };
      },
    };
  };

  try {
    const result = await serviceAccountExportByAccountFiles();
    assert.equal(result.canceled, false);
    assert.equal(result.outputDir, "exports");
    assert.equal(result.exported, 1);
    assert.equal(writtenFiles.get("demo_account.json"), "{\"tokens\":{\"access_token\":\"abc\"}}");
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});
