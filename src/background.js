const CHATGPT_URL_PATTERN = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !CHATGPT_URL_PATTERN.test(tab.url || "")) return;

  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: "CGKP_TOGGLE_PANEL" });
});

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CGKP_PING" });
    return;
  } catch {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["src/styles.css"]
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"]
    });
  }
}
