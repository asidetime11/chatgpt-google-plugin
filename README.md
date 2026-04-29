# chatgpt-google-plugin

Chrome extension for marking key points in ChatGPT conversations and jumping back to saved positions.

## Features

- Add custom key-point marks inside a ChatGPT conversation.
- List detected questions and answers, then jump to the start of each message.
- Favorite any mark or history jump point.
- Store marks and favorites locally per conversation with `chrome.storage.local`.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Open a ChatGPT conversation on `chatgpt.com` or `chat.openai.com`.

## Usage

- Click the extension icon in Chrome to open or close the right-side panel.
- Press `Ctrl+Shift+K` or `Command+Shift+K` as a keyboard fallback to open or close the panel.
- Use the `标注` tab for custom key points. `开启单击标注` and `清空全部` only appear in this tab.
- Click `开启单击标注`, then click any paragraph, list item, code block, or message position in the conversation to save that precise block as a key point.
- Click `结束` to leave one-click marking mode.
- Click `清空全部` to remove all saved key points for the current conversation.
- Use the `历史` tab to jump to each detected conversation round. Each question has at most one paired answer.
- Click `★` beside any mark or history item to add it to `收藏`.
- Use the `收藏` tab for starred jump points.

## Local browser test

```powershell
node scripts/test-server.js
```

Then open `http://127.0.0.1:8765/`.
