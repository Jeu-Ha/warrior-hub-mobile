(() => {
  'use strict';
  let opening;
  async function open() {
    if (opening) return opening;
    opening = (async () => {
      const url = chrome.runtime.getURL('notes/index.html');
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find(tab => String(tab.url || '').split('#')[0] === url);
      if (existing) {
        await chrome.tabs.update(existing.id, {active: true});
        if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, {focused: true});
      } else await chrome.tabs.create({url: url + '#notes', active: true});
    })();
    try { await opening; } finally { opening = null; }
  }
  window.WarriorNotesLauncher = {open};
  document.querySelectorAll('[data-open-warrior-notes]').forEach(button => {
    button.addEventListener('click', () => open().catch(error => {
      button.title = String(error.message || error);
    }));
  });
})();
