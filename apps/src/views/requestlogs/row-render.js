import { formatTs } from "../../utils/format.js";

export function createTopSpacerRow({ columnCount, windowState }) {
  const row = document.createElement("tr");
  row.dataset.spacerTop = "1";
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.style.height = "0px";
  cell.style.padding = "0";
  cell.style.border = "0";
  cell.style.background = "transparent";
  row.appendChild(cell);
  windowState.topSpacerRow = row;
  windowState.topSpacerCell = cell;
  return row;
}

export function createRequestLogRow(item, index, helpers) {
  const {
    resolveAccountDisplayName,
    fallbackAccountDisplayFromKey,
    resolveDisplayRequestPath,
    buildRequestRouteMeta,
  } = helpers;

  const row = document.createElement("tr");
  row.dataset.logRow = "1";
  row.dataset.logIndex = String(index);
  row.className = "requestlog-row";
  const cellTime = document.createElement("td");
  cellTime.className = "requestlog-col requestlog-col-time";
  cellTime.textContent = formatTs(item.createdAt, { emptyLabel: "-" });
  row.appendChild(cellTime);

  const cellAccount = document.createElement("td");
  cellAccount.className = "requestlog-col requestlog-col-account";
  const accountLabel = resolveAccountDisplayName(item);
  const accountId = item?.accountId || item?.account?.id || "";
  const keyId = item?.keyId || "";
  const traceId = String(item?.traceId || "").trim();
  const accountWrap = document.createElement("div");
  accountWrap.className = "cell-stack";
  if (accountLabel) {
    const title = document.createElement("strong");
    title.textContent = accountLabel;
    accountWrap.appendChild(title);
    if (accountId) {
      const meta = document.createElement("small");
      meta.textContent = accountId;
      accountWrap.appendChild(meta);
    }
    cellAccount.title = accountId || accountLabel;
  } else if (accountId) {
    const meta = document.createElement("small");
    meta.textContent = accountId;
    accountWrap.appendChild(meta);
    cellAccount.title = accountId;
  } else {
    const keyFallback = fallbackAccountDisplayFromKey(keyId);
    accountWrap.textContent = keyFallback || "-";
    cellAccount.title = keyFallback || "-";
  }
  if (traceId) {
    const traceMeta = document.createElement("small");
    traceMeta.className = "account-trace";
    traceMeta.textContent = `trace ${traceId}`;
    traceMeta.title = traceId;
    accountWrap.appendChild(traceMeta);
    cellAccount.title = cellAccount.title ? `${cellAccount.title}\ntrace: ${traceId}` : `trace: ${traceId}`;
  }
  cellAccount.appendChild(accountWrap);
  row.appendChild(cellAccount);

  const cellKey = document.createElement("td");
  cellKey.className = "requestlog-col requestlog-col-key";
  cellKey.textContent = item.keyId || "-";
  row.appendChild(cellKey);

  const cellMethod = document.createElement("td");
  cellMethod.className = "requestlog-col requestlog-col-method";
  cellMethod.textContent = item.method || "-";
  row.appendChild(cellMethod);

  const cellPath = document.createElement("td");
  cellPath.className = "requestlog-col requestlog-col-path";
  const displayPath = resolveDisplayRequestPath(item);
  const routeMetaParts = buildRequestRouteMeta(item, displayPath);
  const pathWrap = document.createElement("div");
  pathWrap.className = "cell-stack request-path-stack";
  const pathMainRow = document.createElement("div");
  pathMainRow.className = "request-path-wrap";
  const pathText = document.createElement("span");
  pathText.className = "request-path";
  pathText.textContent = displayPath || item.requestPath || "-";
  const pathTitle = [];
  if (displayPath) {
    pathTitle.push(`显示: ${displayPath}`);
  }
  const recordedPath = String(item?.requestPath || "").trim();
  if (recordedPath && recordedPath !== displayPath) {
    pathTitle.push(`记录: ${recordedPath}`);
  }
  if (routeMetaParts.length > 0) {
    pathTitle.push(...routeMetaParts);
  }
  pathText.title = pathTitle.length > 0 ? pathTitle.join("\n") : "-";
  const copyBtn = document.createElement("button");
  copyBtn.className = "ghost path-copy";
  copyBtn.type = "button";
  copyBtn.textContent = "复制";
  copyBtn.title = "复制请求路径";
  copyBtn.dataset.logIndex = String(index);
  pathMainRow.appendChild(pathText);
  pathMainRow.appendChild(copyBtn);
  pathWrap.appendChild(pathMainRow);
  if (routeMetaParts.length > 0) {
    const routeMeta = document.createElement("small");
    routeMeta.className = "route-meta";
    routeMeta.textContent = routeMetaParts.join(" | ");
    routeMeta.title = routeMeta.textContent;
    pathWrap.appendChild(routeMeta);
  }
  cellPath.appendChild(pathWrap);
  row.appendChild(cellPath);

  const cellModel = document.createElement("td");
  cellModel.className = "requestlog-col requestlog-col-model";
  cellModel.textContent = item.model || "-";
  row.appendChild(cellModel);

  const cellEffort = document.createElement("td");
  cellEffort.className = "requestlog-col requestlog-col-effort";
  cellEffort.textContent = item.reasoningEffort || "-";
  row.appendChild(cellEffort);

  const cellStatus = document.createElement("td");
  cellStatus.className = "requestlog-col requestlog-col-status";
  const statusTag = document.createElement("span");
  statusTag.className = "status-tag";
  const code = item.statusCode == null ? null : Number(item.statusCode);
  statusTag.textContent = code == null ? "-" : String(code);
  if (code != null) {
    if (code >= 200 && code < 300) {
      statusTag.classList.add("status-ok");
    } else if (code >= 400 && code < 500) {
      statusTag.classList.add("status-warn");
    } else if (code >= 500) {
      statusTag.classList.add("status-bad");
    } else {
      statusTag.classList.add("status-unknown");
    }
  } else {
    statusTag.classList.add("status-unknown");
  }
  cellStatus.appendChild(statusTag);
  row.appendChild(cellStatus);

  const cellError = document.createElement("td");
  cellError.className = "requestlog-col requestlog-col-error";
  const errorText = item.error ? String(item.error) : "-";
  const errorSpan = document.createElement("span");
  errorSpan.className = "request-error";
  errorSpan.textContent = errorText;
  if (item.error) {
    errorSpan.title = String(item.error);
  }
  cellError.appendChild(errorSpan);
  row.appendChild(cellError);

  return row;
}

export function renderEmptyRequestLogs(rowsEl, columnCount) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.textContent = "暂无请求日志";
  row.appendChild(cell);
  rowsEl.appendChild(row);
}
