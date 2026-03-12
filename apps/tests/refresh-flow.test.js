import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsRoot = path.resolve(__dirname, "..");
const mainJs = fs.readFileSync(path.join(appsRoot, "src", "main.js"), "utf8");
const appRuntimeJs = fs.readFileSync(path.join(appsRoot, "src", "runtime", "app-runtime.js"), "utf8");

test("main refresh flow uses centralized refresh helpers", () => {
  assert.ok(mainJs.includes("createAppRuntime"), "main.js should compose runtime helpers through createAppRuntime");
  assert.ok(mainJs.includes("ensureAutoRefreshTimer"), "main.js should still pass ensureAutoRefreshTimer into service lifecycle");
  assert.ok(mainJs.includes("stopAutoRefreshTimer"), "main.js should still pass stopAutoRefreshTimer into service lifecycle");
  assert.ok(appRuntimeJs.includes("runRefreshTasks"), "app-runtime.js should own refresh task orchestration");
});

test("refreshAll renders current page only", () => {
  const refreshAllStart = appRuntimeJs.indexOf("async function refreshAll(");
  const refreshAllEnd = appRuntimeJs.indexOf("async function handleRefreshAllClick()", refreshAllStart);
  assert.notEqual(refreshAllStart, -1, "refreshAll should exist");
  assert.notEqual(refreshAllEnd, -1, "handleRefreshAllClick should exist");
  const refreshAllSource = appRuntimeJs.slice(refreshAllStart, refreshAllEnd);

  assert.ok(refreshAllSource.includes("renderCurrentPageView"), "refreshAll should render current page");
  assert.ok(!refreshAllSource.includes("renderAllViews"), "refreshAll should avoid full renderAllViews redraw");
});

test("refreshAll uses single-flight guard", () => {
  const refreshAllStart = appRuntimeJs.indexOf("async function refreshAll(");
  const refreshAllEnd = appRuntimeJs.indexOf("async function handleRefreshAllClick()", refreshAllStart);
  assert.notEqual(refreshAllStart, -1, "refreshAll should exist");
  assert.notEqual(refreshAllEnd, -1, "handleRefreshAllClick should exist");
  const refreshAllSource = appRuntimeJs.slice(refreshAllStart, refreshAllEnd);

  assert.ok(appRuntimeJs.includes("let refreshAllInFlight = null"), "app-runtime.js should define refreshAll single-flight state");
  assert.ok(refreshAllSource.includes("if (refreshAllInFlight)"), "refreshAll should reuse in-flight refresh");
  assert.ok(refreshAllSource.includes("refreshAllInFlight = (async () =>"), "refreshAll should store current run promise");
});
