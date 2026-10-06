(() => {
  'use strict';
  const TOKEN_KEY = 'warriorFastGraphTokensV1';
  const CLIENT_ID = '098158b9-35ee-497c-97c2-3490353cb745';
  const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
  const SCOPES = 'offline_access User.Read Files.ReadWrite';
  let refreshPromise, loginPromise, cancelled = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function getTokens() { return (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY] || null; }
  async function setTokens(tokens) { await chrome.storage.local.set({[TOKEN_KEY]: tokens}); }
  async function clearTokens() { await chrome.storage.local.remove(TOKEN_KEY); }
  async function storeTokens(tokens) {
    const previous = await getTokens() || {};
    await setTokens({...previous, ...tokens, expires_at: Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000});
  }
  async function accessToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const tokens = await getTokens();
      if (tokens?.access_token && Date.now() < Number(tokens.expires_at || 0)) return tokens.access_token;
      if (!tokens?.refresh_token) return null;
      const response = await fetch(AUTHORITY + '/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: SCOPES})});
      const result = await response.json();
      if (response.ok) { await storeTokens(result); return result.access_token; }
      if (['invalid_grant', 'interaction_required'].includes(result.error)) {
        // Do not remove a newer token saved concurrently by the existing phone bridge.
        const latest = await getTokens();
        if (latest?.refresh_token === tokens.refresh_token && latest?.access_token === tokens.access_token) await clearTokens();
        else if (latest?.access_token && Date.now() < Number(latest.expires_at || 0)) return latest.access_token;
        return null;
      }
      throw new Error(result.error_description || result.error || 'Microsoft token refresh failed');
    })();
    try { return await refreshPromise; } finally { refreshPromise = null; }
  }
  function closeLogin() { cancelled = true; document.querySelector('#desktopLoginDialog').hidden = true; }
  async function connect({auto = false} = {}) {
    if (auto) return !!await accessToken();
    if (loginPromise) return loginPromise;
    loginPromise = (async () => {
      cancelled = false;
      const dialog = document.querySelector('#desktopLoginDialog'), status = document.querySelector('#desktopLoginStatus'), code = document.querySelector('#desktopLoginCode'), link = document.querySelector('#desktopLoginLink');
      dialog.hidden = false; status.textContent = 'Connecting to Microsoft…'; code.textContent = ''; link.hidden = true;
      try {
        const response = await fetch(AUTHORITY + '/devicecode', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: CLIENT_ID, scope: SCOPES})});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error_description || result.error || 'Microsoft connection failed');
        const target = new URL(result.verification_uri_complete || result.verification_uri || 'https://microsoft.com/devicelogin');
        if (target.protocol !== 'https:' || !['microsoft.com', 'www.microsoft.com', 'login.microsoftonline.com'].includes(target.hostname)) throw new Error('Unexpected Microsoft sign-in address');
        if (cancelled) return false;
        code.textContent = result.user_code || ''; link.href = target.href; link.hidden = false;
        status.textContent = 'Enter this code in the Microsoft tab. Use the same account as on your tablet.';
        await chrome.tabs.create({url: target.href});
        const deadline = Date.now() + Math.max(60, Number(result.expires_in) || 900) * 1000;
        let interval = Math.max(2, Number(result.interval) || 5);
        while (!cancelled && Date.now() < deadline) {
          await sleep(interval * 1000);
          if (cancelled) return false;
          const tokenResponse = await fetch(AUTHORITY + '/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: CLIENT_ID, device_code: result.device_code})});
          const tokens = await tokenResponse.json();
          if (cancelled) return false;
          if (tokenResponse.ok) { await storeTokens(tokens); dialog.hidden = true; return true; }
          if (tokens.error === 'authorization_pending') continue;
          if (tokens.error === 'slow_down') { interval += 2; continue; }
          throw new Error(tokens.error_description || tokens.error || 'Microsoft sign-in failed');
        }
        if (!cancelled) throw new Error('Sign-in timed out. Close this window and try again.');
        return false;
      } catch (error) { status.textContent = String(error.message || error); throw error; }
    })();
    try { return await loginPromise; } finally { loginPromise = null; }
  }
  async function loadState() { const result = await chrome.runtime.sendMessage({type: 'GET_STATE'}); return result?.state || {}; }
  async function back() {
    await chrome.runtime.sendMessage({type: 'OPEN_STUDY_ROOM'});
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.remove(tab.id);
  }
  function onAuthChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[TOKEN_KEY]) callback(); });
  }
  document.querySelector('#desktopLoginClose').addEventListener('click', closeLogin);
  window.addEventListener('pagehide', () => { cancelled = true; });
  window.WarriorNotesDesktop = {getTokens, setTokens, clearTokens, accessToken, connect, loadState, back, onAuthChange};
})();
