(() => {
  if (window.__warriorWayneMailLoadedV56) return;
  window.__warriorWayneMailLoadedV56 = true;


  const DEBUG_ENABLED_KEY='warriorDebugEnabledV59';let warriorDebugEnabled=false;
  chrome.storage.local.get(DEBUG_ENABLED_KEY).then(g=>warriorDebugEnabled=!!g?.[DEBUG_ENABLED_KEY]).catch(()=>{});
  chrome.storage.onChanged.addListener((c,a)=>{if(a==='local'&&c[DEBUG_ENABLED_KEY])warriorDebugEnabled=!!c[DEBUG_ENABLED_KEY].newValue});
  function debug(event,data={}){if(!warriorDebugEnabled)return;try{chrome.runtime.sendMessage({type:'DEBUG_LOG',source:'mail-content',event,data}).catch(()=>{})}catch(_){}}
  window.addEventListener('error',e=>debug('window-error',{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,error:String(e.error?.stack||e.error||'')}));
  window.addEventListener('unhandledrejection',e=>debug('unhandled-rejection',{reason:String(e.reason?.stack||e.reason||'')}));
  debug('mail-script-boot',{href:location.href,title:document.title});

  let reportTimer = null;
  let lastReportedSignature = '';

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'WARRIOR_SYNC_WAYNE_MAIL') return;
    debug('mail-sync-request',{href:location.href,hidden:document.hidden});
    (async () => {
      try {
        const payload = await captureMailWhenReady();
        debug('mail-sync-result',{messages:payload.messages?.length||0,diagnostics:payload.diagnostics||{},capturedAt:payload.capturedAt});sendResponse({ ok: true, payload });
      } catch (e) {
        debug('mail-sync-error',{error:e?.message||String(e)});sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  });

  // Important for the first-login flow: the background sync can return "login" and stop waiting.
  // When Outlook finally renders, this content script reports the inbox automatically, so the user
  // does NOT need another sync click and no second tab is created.
  const observer = new MutationObserver(() => scheduleAutoReport());
  try { observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label','role','data-convid','data-item-id'] }); } catch {}
  scheduleAutoReport(900);
  // Keep watching for the whole lifetime of the open Inbox. MutationObserver handles
  // fast changes; this periodic pass protects against Outlook virtualization changes.
  setInterval(() => scheduleAutoReport(120), 30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleAutoReport(120);});

  function scheduleAutoReport(delay = 450) {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(async () => {
      try {
        const payload = captureMail();
        const validInbox = payload.diagnostics.bodyHasInbox;
        if (!payload.messages.length && !validInbox) return;
        debug('mail-auto-capture-scan',{messages:payload.messages.length,validInbox,diagnostics:payload.diagnostics});
        const sig = payload.messages.length ? payload.messages.slice(0, 30).map(m => `${m.id}:${m.unread!==false?1:0}:${m.important?1:0}:${m.subject||''}`).join('|') : `empty:${location.href}`;
        if (sig === lastReportedSignature) return;
        lastReportedSignature = sig;
        debug('mail-auto-capture-send',{messages:payload.messages.length,diagnostics:payload.diagnostics});await chrome.runtime.sendMessage({ type: 'WAYNE_MAIL_SYNC_RESULT', payload }).catch(e => debug('mail-auto-capture-send-error',{error:String(e?.message||e)}));
      } catch {}
    }, delay);
  }

  async function captureMailWhenReady() {
    const started = Date.now();
    let last = captureMail();
    while (Date.now() - started < 16000) {
      const found = captureMail();
      last = found;
      if (found.messages.length) return found;
      // If Outlook itself says Inbox and the list landmark is present, an empty list is a valid result.
      if (found.diagnostics.bodyHasInbox && Date.now() - started > 3500) return found;
      await sleep(650);
    }
    return last;
  }

  function captureMail() {
    const candidates = collectCandidates();
    const seen = new Set();
    const messages = [];

    for (const el of candidates) {
      const raw = normalizeTextWithLines(el.innerText || el.textContent || '');
      const aria = normalizeText(el.getAttribute?.('aria-label') || '');
      const combined = normalizeText([aria, raw].filter(Boolean).join(' | '));
      if (!looksLikeMessageRow(combined, el)) continue;
      const parsed = parseRow(raw, aria, combined, el);
      if (!parsed.subject && !parsed.sender) continue;
      const key = `${parsed.sender}|${parsed.subject}|${parsed.timeText}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push(parsed);
      if (messages.length >= 100) break;
    }

    return {
      messages,
      capturedAt: new Date().toISOString(),
      sourceUrl: location.href,
      title: document.title,
      diagnostics: {
        candidateCount: candidates.length,
        messageCount: messages.length,
        hasMessageListLandmark: deepAny('[aria-label*="Message list" i],[role="listbox"],[aria-label*="Inbox" i]'),
        bodyHasInbox: /inbox/i.test(document.body?.innerText || '')
      }
    };
  }

  function collectCandidates() {
    const selectors = [
      '[aria-label*="Message list" i] [role="option"]',
      '[role="listbox"] [role="option"]',
      '[role="main"] [role="option"]',
      '[role="option"][aria-label]',
      '[role="option"][data-selection-index]',
      '[data-automationid="ListCell"]',
      '[data-testid*="message-list" i] [role="option"]',
      '[data-testid*="mail-list" i] [role="option"]',
      '[aria-setsize][aria-posinset][role="option"]',
      '[data-convid]',
      '[data-item-id]',
      '[data-automationid*="message" i]',
      '[data-testid*="message" i]',
      '[data-testid*="mail" i]',
      '[aria-label*="Unread" i]',
      '[aria-label*="conversation" i]'
    ];
    const out = [], uniq = new Set();
    for (const root of getSearchRoots()) {
      for (const sel of selectors) {
        let els = [];
        try { els = [...root.querySelectorAll(sel)]; } catch {}
        for (const el of els) {
          const row = nearestLikelyRow(el);
          if (!row || uniq.has(row)) continue;
          uniq.add(row);
          out.push(row);
        }
      }
    }
    // Geometry fallback for the 2026 Outlook UI / cloud.microsoft domain.
    try {
      const vw = innerWidth, vh = innerHeight;
      const geom = [...document.querySelectorAll('div,li,button')].filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 260 || r.height < 24 || r.height > 125 || r.top < 80 || r.top > vh - 20 || r.left < 100 || r.left > vw * .72) return false;
        const text = normalizeText(el.innerText || '');
        if (text.length < 18 || text.length > 900) return false;
        return /\b(?:today|yesterday|sun|mon|tue|wed|thu|fri|sat|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})\b/i.test(text) || String(el.innerText || '').split(/\n+/).filter(Boolean).length >= 2;
      }).sort((a,b) => { const A=a.getBoundingClientRect(),B=b.getBoundingClientRect(); return A.width*A.height-B.width*B.height; });
      for (const el of geom.slice(0, 350)) { if (!uniq.has(el)) { uniq.add(el); out.push(el); } }
    } catch {}
    return out;
  }

  // New Outlook sometimes places parts of its virtualized UI under open shadow roots.
  function getSearchRoots() {
    const roots = [document];
    const stack = [document.documentElement];
    let visited = 0;
    while (stack.length && visited < 8000) {
      const el = stack.pop();
      visited++;
      if (!el) continue;
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        for (const child of el.shadowRoot.children || []) stack.push(child);
      }
      for (const child of el.children || []) stack.push(child);
    }
    return roots;
  }

  function deepAny(selector) {
    for (const root of getSearchRoots()) {
      try { if (root.querySelector(selector)) return true; } catch {}
    }
    return false;
  }

  function nearestLikelyRow(el) {
    let cur = el;
    for (let i = 0; i < 5 && cur; i++, cur = cur.parentElement) {
      const role = cur.getAttribute?.('role');
      const txt = normalizeText(cur.innerText || cur.textContent || '');
      if (role === 'option' || cur.hasAttribute?.('data-convid') || cur.hasAttribute?.('data-item-id')) return cur;
      if (txt.length >= 25 && txt.length <= 1800 && cur.querySelector?.('span,div')) return cur;
    }
    return el;
  }

  function looksLikeMessageRow(text, el) {
    if (!text || text.length < 12 || text.length > 2600) return false;
    const role = el.getAttribute?.('role');
    if (role === 'option') return true;
    const lower = text.toLowerCase();
    if (lower.includes('new message') && text.length < 100) return false;
    const hasTime = /\b(?:today|yesterday|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\/\d{1,2})\b/i.test(text);
    const hasParts = text.split(/\s*[|\n]\s*/).filter(Boolean).length >= 2;
    return hasTime || hasParts;
  }

  function parseRow(raw, aria, combined, el) {
    const lines = String(raw || '').split(/\n+/).map(normalizeText).filter(Boolean);
    const ariaParts = String(aria || '').split(/,\s+|\s+\|\s+/).map(normalizeText).filter(Boolean);
    let parts = lines.length >= 2 ? lines : ariaParts;
    if (!parts.length) parts = [combined];

    const unread = /\bunread\b/i.test(combined) || /mark as read/i.test(combined);
    const timeText = firstMatch(combined, /\b(?:today|yesterday|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\/\d{1,2})\b/i) || '';

    if (/^(unread|read)$/i.test(parts[0] || '') && parts.length >= 3) parts = parts.slice(1);
    let sender = clean(parts[0] || '');
    let subject = clean(parts[1] || '');
    let snippet = clean(parts.slice(2).join(' · ')).slice(0, 600);

    if ((!subject || subject === sender) && ariaParts.length >= 3) {
      const a = /^(unread|read)$/i.test(ariaParts[0] || '') ? ariaParts.slice(1) : ariaParts;
      sender = clean(a[0] || sender);
      subject = clean(a[1] || subject);
      if (!snippet) snippet = clean(a.slice(2).join(' · ')).slice(0, 600);
    }

    const link = el.querySelector?.('a[href*="/mail/"]')?.href || location.href;
    return {
      id: stableId(`${sender}|${subject}|${snippet.slice(0,120)}|${timeText}`),
      sender, subject, snippet, unread, timeText, url: link
    };
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function firstMatch(text, re) { const m = text.match(re); return m ? m[0] : ''; }
  function normalizeText(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function normalizeTextWithLines(v) { return String(v || '').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim(); }
  function clean(v) { return normalizeText(v).replace(/^(Unread|Read)[,:\s-]*/i, '').trim(); }
  function stableId(s) { let h = 2166136261; for (let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);} return `mail-${(h>>>0).toString(16)}`; }
})();
