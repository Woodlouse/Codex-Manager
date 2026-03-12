export function createRequestLogBindings(config) {
  const {
    dom,
    windowState,
    copyText,
    resolveDisplayRequestPath,
    isNearBottom,
    appendNearBottomBatches,
    scrollBuffer,
    nearBottomMaxBatches,
    appendRequestLogBatch,
  } = config;

  function resolveRequestLogScroller(rowsEl) {
    if (!rowsEl || typeof rowsEl.closest !== "function") {
      return null;
    }
    return rowsEl.closest(".requestlog-wrap");
  }

  async function onRequestLogRowsClick(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== "function") {
      return;
    }
    const copyBtn = target.closest("button.path-copy");
    if (!copyBtn || !dom.requestLogRows || !dom.requestLogRows.contains(copyBtn)) {
      return;
    }
    const index = Number(copyBtn.dataset.logIndex);
    if (!Number.isInteger(index)) {
      return;
    }
    const rowItem = windowState.filtered[index];
    const textToCopy = resolveDisplayRequestPath(rowItem) || rowItem?.requestPath || "";
    if (!textToCopy) {
      return;
    }
    const ok = await copyText(textToCopy);
    copyBtn.textContent = ok ? "已复制" : "失败";
    const token = String(Date.now());
    copyBtn.dataset.copyToken = token;
    setTimeout(() => {
      if (copyBtn.dataset.copyToken !== token) return;
      copyBtn.textContent = "复制";
    }, 900);
  }

  function onRequestLogScroll() {
    if (windowState.scrollTickHandle != null) {
      return;
    }
    const flush = () => {
      windowState.scrollTickHandle = null;
      windowState.scrollTickMode = "";
      if (!isNearBottom(windowState.boundScrollerEl, scrollBuffer)) {
        return;
      }
      appendNearBottomBatches({
        scroller: windowState.boundScrollerEl,
        maxBatches: nearBottomMaxBatches,
        scrollBuffer,
        appendRequestLogBatch,
      });
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      windowState.scrollTickMode = "raf";
      windowState.scrollTickHandle = window.requestAnimationFrame(flush);
      return;
    }
    flush();
  }

  function cancelPendingScrollTick() {
    if (windowState.scrollTickHandle == null) {
      return;
    }
    if (
      windowState.scrollTickMode === "raf"
      && typeof window !== "undefined"
      && typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(windowState.scrollTickHandle);
    } else {
      clearTimeout(windowState.scrollTickHandle);
    }
    windowState.scrollTickHandle = null;
    windowState.scrollTickMode = "";
  }

  function ensureRequestLogBindings() {
    const rowsEl = dom.requestLogRows;
    if (!rowsEl || typeof rowsEl.addEventListener !== "function") {
      return;
    }
    if (windowState.boundRowsEl && windowState.boundRowsEl !== rowsEl) {
      windowState.boundRowsEl.removeEventListener("click", onRequestLogRowsClick);
    }
    if (windowState.boundRowsEl !== rowsEl) {
      rowsEl.addEventListener("click", onRequestLogRowsClick);
      windowState.boundRowsEl = rowsEl;
    }
    const scroller = resolveRequestLogScroller(rowsEl);
    if (windowState.boundScrollerEl && windowState.boundScrollerEl !== scroller) {
      windowState.boundScrollerEl.removeEventListener("scroll", onRequestLogScroll);
      cancelPendingScrollTick();
    }
    if (scroller && windowState.boundScrollerEl !== scroller) {
      scroller.addEventListener("scroll", onRequestLogScroll, { passive: true });
      windowState.boundScrollerEl = scroller;
    } else if (!scroller) {
      cancelPendingScrollTick();
      windowState.boundScrollerEl = null;
    }
  }

  return { ensureRequestLogBindings };
}
