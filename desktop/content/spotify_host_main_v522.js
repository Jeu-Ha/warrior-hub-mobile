(() => {
  'use strict';
  if (window.__warriorSpotifyHostV522) return;
  window.__warriorSpotifyHostV522 = true;

  // Only the outer Spotify embed owns the Warrior controller. The nested frame
  // created by Spotify's official IFrame API is the real playback surface.
  try { if (window.parent !== window.top) return; } catch (_) { return; }

  const CMD_SOURCE = 'warrior-spotify-host-v522-command';
  const EVENT_SOURCE = 'warrior-spotify-host-v522-event';
  const API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';
  const DEFAULT_URI = 'spotify:playlist:3pRLVP3hoPzbZtetvH1tro';
  const now = () => Date.now();
  const clean = v => String(v || '').trim();

  let controller = null;
  let api = null;
  let mount = null;
  let ready = false;
  let currentUri = '';
  let lastUpdate = null;
  let pending = null;
  let everPlayed = false;
  let resumeWhenReady = false;
  let generation = 0;

  function emit(type, payload = {}) {
    try { window.parent.postMessage({ source: EVENT_SOURCE, type, payload: { ...payload, at: now() } }, '*'); } catch (_) {}
  }

  function initialUri() {
    const p = location.pathname.split('/').filter(Boolean);
    if (p[0] === 'embed' && p[1] && p[2]) return `spotify:${p[1]}:${p[2]}`;
    return DEFAULT_URI;
  }

  function suppressOuterNativeMedia() {
    try {
      for (const el of document.querySelectorAll('audio,video')) {
        try { el.pause(); el.muted = true; } catch (_) {}
      }
    } catch (_) {}
  }

  function startPendingOnce(label, targetPending = pending) {
    if (!controller || !targetPending || targetPending.startSent) return false;
    targetPending.startSent = true;
    try {
      controller.play();
      emit('start_sent', { label, uri: targetPending.uri, generation: targetPending.generation });
      return true;
    } catch (error) {
      emit('command_error', { action: 'play', label, error: String(error?.message || error) });
      return false;
    }
  }

  function confirmPending(uri, positionMs = 0) {
    if (!pending || uri !== pending.uri) return false;
    // Do NOT treat isPaused:false @ 0:00 as proof that audio really advanced.
    // Spotify can report that transient state while an offscreen/throttled entity
    // has not actually begun rendering. Parent state is confirmed by real progress.
    if (!(Number(positionMs) > 80)) return false;
    const done = pending;
    pending = null;
    everPlayed = true;
    emit('load_confirmed', { uri, generation: done.generation, latencyMs: now() - done.at, position: Number(positionMs) || 0 });
    return true;
  }

  function onPlaybackStarted(event) {
    const data = event?.data || {};
    const uri = clean(data.playingURI);
    if (uri) currentUri = uri;
    emit('playback_started', data);
  }

  function onPlaybackUpdate(event) {
    const data = event?.data || {};
    const uri = clean(data.playingURI);
    if (uri) currentUri = uri;
    lastUpdate = data;
    if (data.isPaused === false && Number(data.position) > 80) everPlayed = true;
    confirmPending(uri, data.position);
    emit('playback_update', data);
  }

  function onReady() {
    ready = true;
    emit('ready', { uri: currentUri, pending: pending ? { uri: pending.uri, generation: pending.generation, startSent: pending.startSent } : null });
    if (pending?.autoplay) startPendingOnce('initial-ready', pending);
    else if (resumeWhenReady && controller) {
      resumeWhenReady = false;
      try { controller.resume(); emit('resume_sent', { label: 'initial-ready', uri: currentUri, generation }); }
      catch (error) { emit('command_error', { action: 'resume', label: 'initial-ready', error: String(error?.message || error) }); }
    }
  }

  function sizeController() {
    if (!mount) return;
    try {
      const w = Math.max(320, Math.round(window.innerWidth || 420));
      const h = Math.max(180, Math.round(window.innerHeight || 220));
      mount.style.width = `${w}px`;
      mount.style.height = `${h}px`;
    } catch (_) {}
  }

  function createController() {
    if (!api || controller) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', createController, { once: true });
      return;
    }
    suppressOuterNativeMedia();
    const observer = new MutationObserver(suppressOuterNativeMedia);
    try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

    mount = document.createElement('div');
    mount.id = 'warrior-spotify-controller-v520';
    // IMPORTANT: the official nested Spotify player stays compositor-visible.
    // Warrior's opaque custom UI covers the *outer* iframe in study.html, so this
    // can render normally here without exposing a second player to the user.
    Object.assign(mount.style, {
      position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
      opacity: '1', visibility: 'visible', pointerEvents: 'none', zIndex: '2147483647',
      overflow: 'hidden', background: '#121212'
    });
    document.body.appendChild(mount);
    sizeController();
    window.addEventListener('resize', sizeController, { passive: true });

    const uri = initialUri();
    try {
      api.createController(mount, { uri, width: '100%', height: '100%' }, c => {
        controller = c;
        currentUri = uri;
        c.addListener('ready', onReady);
        c.addListener('playback_started', onPlaybackStarted);
        c.addListener('playback_update', onPlaybackUpdate);
        emit('controller_created', { uri, visible: true });
      });
    } catch (error) {
      emit('api_error', { stage: 'createController', error: String(error?.message || error) });
    }
  }

  function installApi() {
    const previous = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = IFrameAPI => {
      try { if (typeof previous === 'function') previous(IFrameAPI); } catch (_) {}
      api = IFrameAPI;
      createController();
    };
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => emit('api_error', { stage: 'script', error: 'Spotify IFrame API failed to load' });
    const attach = () => (document.head || document.documentElement)?.appendChild(script);
    if (document.documentElement) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
    setTimeout(() => { if (!controller) emit('api_slow', { ready: false }); }, 3500);
  }

  function handleCommand(cmd = {}) {
    const action = clean(cmd.action);
    if (!action) return;
    if (!controller) {
      emit('not_ready', { action, seq: cmd.seq || '' });
      return;
    }
    try {
      if (action === 'load') {
        const uri = clean(cmd.uri);
        if (!uri) return;
        generation += 1;
        pending = { uri, autoplay: cmd.autoplay !== false, startSent: false, generation, at: now() };
        currentUri = uri;
        controller.loadEntity(uri, false, 0);
        emit('loading', { uri, autoplay: pending.autoplay, generation, seq: cmd.seq || '' });
        if (ready && pending.autoplay) startPendingOnce('load-immediate', pending);
        return;
      }
      if (action === 'resume' || action === 'play') {
        if (!ready) {
          resumeWhenReady = true;
          if (pending) pending.autoplay = true;
          emit('resume_armed', { uri: pending?.uri || currentUri, generation: pending?.generation || generation, seq: cmd.seq || '' });
        } else if (pending) {
          pending.autoplay = true;
          startPendingOnce('manual-pending', pending);
        } else {
          controller.resume();
          emit('resume_sent', { label: 'manual', uri: currentUri, generation });
        }
        return;
      }
      if (action === 'pause') { resumeWhenReady = false; if (pending) pending.autoplay = false; controller.pause(); return; }
      if (action === 'toggle') { controller.togglePlay(); return; }
      if (action === 'restart') { controller.restart(); emit('restart_sent', { uri: currentUri, generation, seq: cmd.seq || '' }); return; }
      if (action === 'seek') { controller.seek(Math.max(0, Number(cmd.seconds) || 0)); return; }
      if (action === 'status') {
        emit('status', { ready, uri: currentUri, pending: pending ? { ...pending } : null, lastUpdate, everPlayed });
      }
    } catch (error) {
      emit('command_error', { action, error: String(error?.message || error), seq: cmd.seq || '' });
    }
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.source !== CMD_SOURCE) return;
    handleCommand(data.command || data.payload || {});
  });

  installApi();
})();
