(() => {
  'use strict';
  const KEY = 'warriorSpotifyDspState';
  const TELEMETRY_KEY = 'warriorSpotifyDspTelemetry';

  function forward(payload) {
    try { window.postMessage({ source: 'warrior-spotify-bridge', payload }, '*'); } catch (_) {}
  }

  async function pushCurrent() {
    try {
      const got = await chrome.storage.local.get(KEY);
      if (got && got[KEY]) forward(got[KEY]);
    } catch (_) {}
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    forward(changes[KEY].newValue || { enabled: false, seq: Date.now() });
  });

  window.addEventListener('message', e => {
    if (!e.data || e.data.source !== 'warrior-spotify-dsp-status') return;
    const p = e.data.payload || {};
    // Many Spotify embed frames are empty shells. Do not let an empty frame overwrite
    // useful telemetry from the frame that actually owns Spotify's AudioContext/media.
    const useful = Number(p.connected) > 0 || Number(p.playing) > 0 || /failed|error/i.test(String(p.event || ''));
    if (!useful) return;
    chrome.storage.local.set({ [TELEMETRY_KEY]: p }).catch(() => {});
  });

  pushCurrent();
})();
