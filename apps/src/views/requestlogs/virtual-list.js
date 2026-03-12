function getRowHeight(row, fallbackRowHeight) {
  if (!row) return fallbackRowHeight;
  if (typeof row.getBoundingClientRect === "function") {
    const rectHeight = Number(row.getBoundingClientRect().height);
    if (Number.isFinite(rectHeight) && rectHeight > 0) {
      return rectHeight;
    }
  }
  const offsetHeight = Number(row.offsetHeight);
  if (Number.isFinite(offsetHeight) && offsetHeight > 0) {
    return offsetHeight;
  }
  return fallbackRowHeight;
}

export function updateTopSpacer(windowState) {
  const spacerRow = windowState.topSpacerRow;
  const spacerCell = windowState.topSpacerCell;
  if (!spacerRow || !spacerCell) return;
  const height = Math.max(0, Math.round(windowState.topSpacerHeight));
  spacerRow.hidden = height <= 0;
  spacerCell.style.height = `${height}px`;
}

export function recycleLogRowsIfNeeded(config) {
  const {
    rowsEl,
    windowState,
    domLimit,
    domRecycleTo,
    fallbackRowHeight,
  } = config;
  if (!rowsEl) return;
  const rows = [];
  for (const child of rowsEl.children) {
    if (child?.dataset?.logRow === "1") {
      rows.push(child);
    }
  }
  if (rows.length <= domLimit) {
    return;
  }
  const removeCount = rows.length - domRecycleTo;
  // 中文注释：避免对每一行调用 getBoundingClientRect/offsetHeight（强制同步布局，滚动时很容易卡顿）。
  // 这里抽样一行高度来估算回收高度即可；配合 error/path 的摘要展示，行高波动很小。
  const sampleHeight = getRowHeight(rows[0], fallbackRowHeight);
  if (Number.isFinite(sampleHeight) && sampleHeight > 0) {
    windowState.recycledRowHeight = sampleHeight;
  }
  const removedHeight = windowState.recycledRowHeight * removeCount;
  for (let i = 0; i < removeCount; i += 1) {
    rows[i].remove();
  }
  windowState.topSpacerHeight += removedHeight;
  updateTopSpacer(windowState);
}

export function appendRequestLogBatch(config) {
  const {
    rowsEl,
    windowState,
    batchSize,
    createRow,
    domLimit,
    domRecycleTo,
    fallbackRowHeight,
  } = config;
  if (!rowsEl) return false;
  const start = windowState.nextIndex;
  if (start >= windowState.filtered.length) return false;
  const end = Math.min(start + batchSize, windowState.filtered.length);
  const fragment = document.createDocumentFragment();
  for (let i = start; i < end; i += 1) {
    fragment.appendChild(createRow(windowState.filtered[i], i));
  }
  rowsEl.appendChild(fragment);
  windowState.nextIndex = end;
  recycleLogRowsIfNeeded({
    rowsEl,
    windowState,
    domLimit,
    domRecycleTo,
    fallbackRowHeight,
  });
  return true;
}

export function isNearBottom(scroller, scrollBuffer) {
  if (!scroller) return false;
  const scrollTop = Number(scroller.scrollTop);
  const clientHeight = Number(scroller.clientHeight);
  const scrollHeight = Number(scroller.scrollHeight);
  if (
    !Number.isFinite(scrollTop)
    || !Number.isFinite(clientHeight)
    || !Number.isFinite(scrollHeight)
  ) {
    return false;
  }
  return scrollTop + clientHeight >= scrollHeight - scrollBuffer;
}

export function appendNearBottomBatches(config) {
  const {
    scroller,
    maxBatches,
    scrollBuffer,
    appendRequestLogBatch,
  } = config;
  let appended = false;
  let rounds = 0;
  while (rounds < maxBatches && isNearBottom(scroller, scrollBuffer) && appendRequestLogBatch()) {
    appended = true;
    rounds += 1;
  }
  return appended;
}

export function appendAtLeastOneBatch(config) {
  const {
    scroller,
    extraMaxBatches,
    scrollBuffer,
    nearBottomMaxBatches,
    appendRequestLogBatch,
  } = config;
  const appended = appendRequestLogBatch();
  if (!appended) return false;
  const maxBatches = extraMaxBatches ?? (nearBottomMaxBatches - 1);
  if (maxBatches > 0) {
    appendNearBottomBatches({
      scroller,
      maxBatches,
      scrollBuffer,
      appendRequestLogBatch,
    });
  }
  return true;
}
