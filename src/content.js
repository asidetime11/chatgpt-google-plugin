(() => {
  const ROOT_ID = "cgkp-root";
  const TOGGLE_ID = "cgkp-toggle";
  const MARK_ATTR = "data-cgkp-mark-id";
  const HISTORY_ATTR = "data-cgkp-history-id";
  const MESSAGE_SELECTOR = '[data-message-author-role="user"], [data-message-author-role="assistant"]';

  const state = {
    marks: [],
    favorites: [],
    history: [],
    jumpTargets: new Map(),
    selectedText: "",
    pickMode: false,
    conversationKey: getConversationKey(),
    panelOpen: false,
    activeTab: "marks"
  };

  boot();

  function boot() {
    if (document.getElementById(ROOT_ID)) return;

    createShell();
    loadState().then(() => {
      refreshHistory();
      attachStoredMarkers();
      render();
    });

    document.addEventListener("selectionchange", captureSelection);
    document.addEventListener("keydown", handleShortcuts);
    document.addEventListener("click", handlePageClick, true);
    setupRuntimeMessages();

    const observer = new MutationObserver(debounce((mutations) => {
      if (mutations.every((mutation) => isExtensionNode(mutation.target))) return;

      const nextKey = getConversationKey();
      if (nextKey !== state.conversationKey) {
        state.conversationKey = nextKey;
        state.marks = [];
        state.favorites = [];
        loadState().then(() => {
          refreshHistory();
          attachStoredMarkers();
          render();
        });
        return;
      }

      refreshHistory();
      attachStoredMarkers();
      render();
    }, 250));

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function createShell() {
    const toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.type = "button";
    toggle.textContent = "关键点";
    toggle.addEventListener("click", () => setPanelOpen(!state.panelOpen));

    const root = document.createElement("aside");
    root.id = ROOT_ID;
    root.setAttribute("aria-label", "ChatGPT key points");

    document.body.append(toggle, root);
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    if (!root || !toggle) return;

    toggle.classList.toggle("cgkp-open", state.panelOpen);
    root.classList.toggle("cgkp-hidden", !state.panelOpen);
    document.documentElement.classList.toggle("cgkp-panel-open", state.panelOpen);

    if (!state.panelOpen) {
      root.innerHTML = "";
      return;
    }

    root.innerHTML = `
      <div class="cgkp-header">
        <div>
          <div class="cgkp-title">关键点</div>
          <div class="cgkp-subtitle">${escapeHtml(getConversationLabel())}</div>
        </div>
        <button class="cgkp-icon-button" type="button" data-action="close" title="收起">×</button>
      </div>

      ${state.activeTab === "marks" ? renderMarkControls() : ""}

      <div class="cgkp-tabs" role="tablist">
        <button type="button" class="${state.activeTab === "marks" ? "cgkp-active" : ""}" data-tab="marks">标注</button>
        <button type="button" class="${state.activeTab === "history" ? "cgkp-active" : ""}" data-tab="history">历史</button>
        <button type="button" class="${state.activeTab === "favorites" ? "cgkp-active" : ""}" data-tab="favorites">收藏</button>
      </div>

      <div class="cgkp-list">
        ${renderActiveList()}
      </div>
    `;

    bindPanelEvents(root);
  }

  function renderMarkControls() {
    return `
      <div class="cgkp-actions">
        <button class="cgkp-primary ${state.pickMode ? "cgkp-pick-active" : ""}" type="button" data-action="toggle-pick">
          ${state.pickMode ? "结束" : "开启单击标注"}
        </button>
        <button class="cgkp-secondary" type="button" data-action="delete-all" ${state.marks.length ? "" : "disabled"}>清空全部</button>
      </div>
    `;
  }

  function renderActiveList() {
    if (state.activeTab === "marks") return renderMarks();
    if (state.activeTab === "history") return renderHistory();
    return renderFavorites();
  }

  function bindPanelEvents(root) {
    root.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      setPanelOpen(false);
    });

    root.querySelector('[data-action="toggle-pick"]')?.addEventListener("click", () => {
      state.pickMode = !state.pickMode;
      document.documentElement.classList.toggle("cgkp-picking", state.pickMode);
      render();
    });

    root.querySelector('[data-action="delete-all"]')?.addEventListener("click", () => {
      deleteAllMarks();
    });

    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTab = button.dataset.tab;
        if (state.activeTab !== "marks" && state.pickMode) {
          state.pickMode = false;
          document.documentElement.classList.remove("cgkp-picking");
        }
        refreshHistory();
        render();
      });
    });

    root.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => jumpToPoint(button.dataset.jump));
    });

    root.querySelectorAll("[data-favorite]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFavorite(button.dataset.favorite);
      });
    });

    root.querySelectorAll("[data-delete-mark]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteMark(button.dataset.deleteMark);
      });
    });
  }

  function renderMarks() {
    if (!state.marks.length) {
      return `<div class="cgkp-empty">开启单击标注后，直接点击会话中的任意位置即可保存。</div>`;
    }

    return state.marks.map((mark) => renderJumpItem({
      id: getPointId("mark", mark.id),
      title: mark.title,
      kind: "mark",
      deletable: true,
      deleteId: mark.id
    })).join("");
  }

  function renderHistory() {
    if (!state.history.length) {
      return `<div class="cgkp-empty">暂时没有识别到问题和回答。</div>`;
    }

    return state.history.map((item) => renderJumpItem({
      id: item.id,
      title: item.title,
      preview: item.preview,
      kind: item.role
    })).join("");
  }

  function renderFavorites() {
    const items = state.favorites
      .map((favorite) => resolveFavorite(favorite))
      .filter(Boolean);

    if (!items.length) {
      return `<div class="cgkp-empty">点击星标后，跳转点会出现在这里。</div>`;
    }

    return items.map((item) => renderJumpItem({
      id: item.id,
      title: item.title,
      preview: item.preview,
      kind: item.kind,
      fromFavorites: true
    })).join("");
  }

  function renderJumpItem(item) {
    const isFavorite = hasFavorite(item.id);
    return `
      <article class="cgkp-item cgkp-${escapeHtml(item.kind)}">
        <button class="cgkp-item-main" type="button" data-jump="${escapeHtml(item.id)}">
          <span class="cgkp-item-title">${escapeHtml(item.title)}</span>
          ${item.preview ? `<span class="cgkp-item-preview">${escapeHtml(item.preview)}</span>` : ""}
        </button>
        <div class="cgkp-item-tools">
          <button class="cgkp-tool ${isFavorite ? "cgkp-favorited" : ""}" type="button" data-favorite="${escapeHtml(item.id)}" title="${isFavorite ? "取消收藏" : "收藏"}">★</button>
          ${item.deletable ? `<button class="cgkp-delete" type="button" data-delete-mark="${escapeHtml(item.deleteId)}" title="删除">×</button>` : ""}
        </div>
      </article>
    `;
  }

  function createMarkFromClick(target) {
    const message = getMessageForTarget(target);
    if (!message || isExtensionNode(message)) return;

    createMark(target, {
      clickedText: normalizeText(target.innerText || target.textContent || "")
    });
  }

  function createMark(target, options = {}) {
    const anchor = getAnchorElement(target);
    const message = getMessageForTarget(anchor);
    const preview = normalizeText(state.selectedText || anchor.innerText || anchor.textContent || "当前会话位置");
    const clickedText = normalizeText(options.clickedText || "");
    const title = (makeAutoTitle(anchor, clickedText || preview) || "关键点").trim();

    const mark = {
      id: crypto.randomUUID(),
      title,
      preview: preview.slice(0, 140),
      conversationKey: state.conversationKey,
      createdAt: new Date().toISOString(),
      scrollY: Math.round(window.scrollY),
      textHint: preview.slice(0, 220),
      blockTextHint: preview.slice(0, 220),
      messageIndex: getMessageIndex(message || anchor),
      blockIndex: getBlockIndex(anchor)
    };

    state.marks.unshift(mark);
    saveState().then(() => {
      attachStoredMarkers();
      state.activeTab = "marks";
      render();
      jumpToPoint(getPointId("mark", mark.id));
    });
  }

  function handlePageClick(event) {
    if (!state.pickMode || isExtensionNode(event.target)) return;

    const target = event.target.closest?.("article, [data-message-author-role]");
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    createMarkFromClick(event.target);
  }

  function setupRuntimeMessages() {
    if (!globalThis.chrome?.runtime?.onMessage) return;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "CGKP_PING") {
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "CGKP_TOGGLE_PANEL") {
        setPanelOpen(!state.panelOpen);
        sendResponse({ ok: true, panelOpen: state.panelOpen });
      }
    });
  }

  function setPanelOpen(panelOpen) {
    state.panelOpen = panelOpen;
    if (!panelOpen) {
      state.pickMode = false;
      document.documentElement.classList.remove("cgkp-picking");
    } else {
      refreshHistory();
    }
    render();
  }

  function deleteMark(id) {
    state.marks = state.marks.filter((mark) => mark.id !== id);
    state.favorites = state.favorites.filter((favorite) => favorite.id !== getPointId("mark", id));
    document.querySelector(`[${MARK_ATTR}="${cssEscape(id)}"]`)?.removeAttribute(MARK_ATTR);
    saveState().then(render);
  }

  function deleteAllMarks() {
    const markIds = new Set(state.marks.map((mark) => getPointId("mark", mark.id)));
    state.marks = [];
    state.favorites = state.favorites.filter((favorite) => !markIds.has(favorite.id));
    document.querySelectorAll(`[${MARK_ATTR}]`).forEach((element) => {
      element.removeAttribute(MARK_ATTR);
    });
    saveState().then(render);
  }

  function jumpToPoint(id) {
    const target = findPointTarget(id);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    pulse(target);
  }

  function findPointTarget(id) {
    const parsed = parsePointId(id);
    if (!parsed) return null;

    if (parsed.type === "mark") {
      const mark = state.marks.find((item) => item.id === parsed.key);
      return mark ? findMarkTarget(mark) : null;
    }

    refreshHistory();
    const history = state.history.find((item) => item.id === id);
    return history ? state.jumpTargets.get(history.id) : null;
  }

  function findMarkTarget(mark) {
    const marked = document.querySelector(`[${MARK_ATTR}="${cssEscape(mark.id)}"]`);
    if (marked) return marked;

    const messages = getMessageElements();
    if (Number.isInteger(mark.messageIndex) && messages[mark.messageIndex]) {
      const message = messages[mark.messageIndex];
      const blocks = getBlockElements(message);

      if (Number.isInteger(mark.blockIndex) && blocks[mark.blockIndex]) return blocks[mark.blockIndex];

      if (mark.blockTextHint) {
        const blockHint = mark.blockTextHint.slice(0, 80);
        const block = blocks.find((item) => normalizeText(item.innerText || item.textContent || "").includes(blockHint));
        if (block) return block;
      }

      return message;
    }

    if (mark.textHint) {
      const hint = mark.textHint.slice(0, 80);
      for (const message of messages) {
        const block = getBlockElements(message).find((item) => normalizeText(item.innerText || item.textContent || "").includes(hint));
        if (block) return block;
      }
    }

    return null;
  }

  function attachStoredMarkers() {
    document.querySelectorAll(`[${MARK_ATTR}]`).forEach((element) => {
      element.removeAttribute(MARK_ATTR);
    });

    state.marks.forEach((mark) => {
      const target = findMarkTarget(mark);
      if (target) target.setAttribute(MARK_ATTR, mark.id);
    });
  }

  function refreshHistory() {
    state.jumpTargets = new Map();
    const messages = getConversationMessages();
    const history = [];
    let turnIndex = 0;
    let hasAnswerForTurn = false;

    messages.forEach(({ role, element }, index) => {
      if (role === "user") {
        turnIndex += 1;
        hasAnswerForTurn = false;
      } else {
        if (!turnIndex || hasAnswerForTurn) return;
        hasAnswerForTurn = true;
      }

      const id = getPointId("history", `${role}-${index}`);
      const preview = normalizeText(element.innerText || element.textContent || "");
      element.setAttribute(HISTORY_ATTR, id);
      state.jumpTargets.set(id, element);

      history.push({
        id,
        role,
        roleIndex: turnIndex,
        title: `${role === "user" ? "问题" : "回答"} ${turnIndex}`,
        preview: preview.slice(0, 120)
      });
    });

    state.history = history;
  }

  function getConversationMessages() {
    const roleNodes = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    const seen = new Set();
    const messages = [];

    roleNodes.forEach((roleNode) => {
      if (isExtensionNode(roleNode)) return;

      const role = roleNode.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") return;

      const element = getMessageForTarget(roleNode) || roleNode;
      if (!element || seen.has(element)) return;

      const text = normalizeText(element.innerText || element.textContent || "");
      if (!text) return;

      seen.add(element);
      messages.push({ role, element });
    });

    return messages;
  }

  function getMessageElements() {
    return getConversationMessages().map((message) => message.element);
  }

  function getSelectionTarget() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    const node = selection.anchorNode;
    const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return element?.closest?.("article") || element?.closest?.("main") || null;
  }

  function toggleFavorite(id) {
    const existingIndex = state.favorites.findIndex((favorite) => favorite.id === id);
    if (existingIndex >= 0) {
      state.favorites.splice(existingIndex, 1);
      saveState().then(render);
      return;
    }

    const point = resolvePoint(id);
    if (!point) return;

    state.favorites.unshift({
      id,
      title: point.title,
      preview: point.preview || "",
      kind: point.kind,
      createdAt: new Date().toISOString()
    });
    saveState().then(render);
  }

  function hasFavorite(id) {
    return state.favorites.some((favorite) => favorite.id === id);
  }

  function resolveFavorite(favorite) {
    const point = resolvePoint(favorite.id);
    if (point) return point;
    return {
      id: favorite.id,
      title: favorite.title,
      preview: favorite.preview,
      kind: favorite.kind || "favorite"
    };
  }

  function resolvePoint(id) {
    const parsed = parsePointId(id);
    if (!parsed) return null;

    if (parsed.type === "mark") {
      const mark = state.marks.find((item) => item.id === parsed.key);
      if (!mark) return null;
      return {
        id,
        title: mark.title,
        preview: mark.preview,
        kind: "mark"
      };
    }

    refreshHistory();
    const history = state.history.find((item) => item.id === id);
    if (!history) return null;
    return {
      id,
      title: history.title,
      preview: history.preview,
      kind: history.role
    };
  }

  function isExtensionNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest?.(`#${ROOT_ID}, #${TOGGLE_ID}`));
  }

  function captureSelection() {
    const selection = window.getSelection();
    state.selectedText = selection && !selection.isCollapsed
      ? normalizeText(selection.toString()).slice(0, 220)
      : "";
  }

  function getMessageIndex(target) {
    const messages = getMessageElements();
    const message = getMessageForTarget(target) || target;
    const index = messages.indexOf(message);
    return index >= 0 ? index : null;
  }

  function getMessageForTarget(target) {
    const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    return element?.closest?.("article") || element?.closest?.("[data-message-author-role]") || null;
  }

  function getAnchorElement(target) {
    const element = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    const message = getMessageForTarget(element);
    if (!message) return element || document.body;

    const block = element.closest?.("h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table");
    if (block && message.contains(block)) return block;

    return message;
  }

  function getBlockElements(message) {
    const blocks = Array.from(message.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table"))
      .filter((element) => normalizeText(element.innerText || element.textContent || "").length > 0);

    return blocks.length ? blocks : [message];
  }

  function getBlockIndex(anchor) {
    const message = getMessageForTarget(anchor);
    if (!message) return null;

    const block = getAnchorElement(anchor);
    const index = getBlockElements(message).indexOf(block);
    return index >= 0 ? index : null;
  }

  function makeAutoTitle(target, fallback) {
    const heading = target.querySelector?.("h1, h2, h3")?.innerText;
    const text = normalizeText(heading || fallback || "");
    if (!text) return `关键点 ${state.marks.length + 1}`;
    return text.slice(0, 40);
  }

  async function loadState() {
    const keys = storageKeys();
    const data = await getStorage(keys);
    const oldMarksKey = `cgkp:${state.conversationKey}`;
    const oldData = await getStorage({ oldMarks: oldMarksKey });
    state.marks = Array.isArray(data[keys.marks])
      ? data[keys.marks]
      : Array.isArray(oldData[oldMarksKey])
        ? oldData[oldMarksKey]
        : [];
    state.favorites = Array.isArray(data[keys.favorites]) ? data[keys.favorites] : [];
  }

  async function saveState() {
    const keys = storageKeys();
    await setStorage({
      [keys.marks]: state.marks,
      [keys.favorites]: state.favorites
    });
  }

  async function getStorage(keys) {
    if (hasChromeStorage()) return chrome.storage.local.get(Object.values(keys));

    return Object.fromEntries(Object.values(keys).map((key) => [
      key,
      JSON.parse(window.localStorage.getItem(key) || "null")
    ]));
  }

  async function setStorage(value) {
    if (hasChromeStorage()) {
      await chrome.storage.local.set(value);
      return;
    }

    Object.entries(value).forEach(([key, item]) => {
      window.localStorage.setItem(key, JSON.stringify(item));
    });
  }

  function hasChromeStorage() {
    return Boolean(globalThis.chrome?.storage?.local);
  }

  function storageKeys() {
    return {
      marks: `cgkp:${state.conversationKey}:marks`,
      favorites: `cgkp:${state.conversationKey}:favorites`
    };
  }

  function getPointId(type, key) {
    return `${type}:${key}`;
  }

  function parsePointId(id) {
    const [type, ...rest] = String(id || "").split(":");
    const key = rest.join(":");
    if (!type || !key) return null;
    return { type, key };
  }

  function getConversationKey() {
    const path = window.location.pathname.replace(/\/$/, "");
    const conversationMatch = path.match(/\/c\/([^/]+)/);
    if (conversationMatch) return conversationMatch[1];
    return path || "home";
  }

  function getConversationLabel() {
    const title = document.title.replace(/\s*-\s*ChatGPT\s*$/i, "").trim();
    return title && title !== "ChatGPT" ? title : state.conversationKey;
  }

  function handleShortcuts(event) {
    if (event.key.toLowerCase() === "k" && event.shiftKey && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setPanelOpen(!state.panelOpen);
      return;
    }
  }

  function pulse(element) {
    element.classList.remove("cgkp-pulse");
    requestAnimationFrame(() => {
      element.classList.add("cgkp-pulse");
      window.setTimeout(() => element.classList.remove("cgkp-pulse"), 1300);
    });
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }
})();
