(() => {
  if (window.__warriorCalculusTrackerV518) return;
  window.__warriorCalculusTrackerV518 = true;

  const ITEM_PREFIX = '/details/stewart-j.-clegg-d.-watson-s.-calculus.-early-transcendentals-9ed-2020';
  let last = '';
  let timer = null;

  function validUrl() {
    try {
      const u = new URL(location.href);
      if (u.origin !== 'https://archive.org') return '';
      if (!u.pathname.startsWith(ITEM_PREFIX)) return '';
      return u.href;
    } catch (_) { return ''; }
  }

  function publish() {
    const url = validUrl();
    if (!url || url === last) return;
    last = url;
    chrome.runtime.sendMessage({ type:'CALCULUS_BOOK_PROGRESS', url }).catch(() => {});
  }

  publish();
  window.addEventListener('popstate', publish, true);
  window.addEventListener('hashchange', publish, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) publish(); });
  timer = setInterval(publish, 1200);
  window.addEventListener('pagehide', () => { publish(); if (timer) clearInterval(timer); }, { once:true });
})();
