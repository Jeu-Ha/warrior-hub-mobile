(() => {
  'use strict';
  if (window.__warriorSpotifyFxV520) return;
  window.__warriorSpotifyFxV520 = true;

  // Only Spotify's nested playback frame should own the FX hook. The outer embed
  // is merely Warrior's API host shell.
  try { if (window.parent === window.top) return; } catch (_) { return; }

  const BRIDGE_SOURCE = 'warrior-spotify-bridge';
  const STATUS_SOURCE = 'warrior-spotify-dsp-status';
  const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
  const AudioNodeProto = window.AudioNode?.prototype || null;
  const OriginalAudioNodeConnect = AudioNodeProto?.connect || null;
  const OriginalAudioNodeDisconnect = AudioNodeProto?.disconnect || null;
  const inlineRoutes = new WeakMap();
  if (!OriginalAudioContext) return;

  // Route only MediaElementAudioSourceNodes that Warrior explicitly registers.
  // This keeps the real node identity intact while inserting FX before the exact
  // downstream node Spotify asked to connect to.
  if (AudioNodeProto && OriginalAudioNodeConnect) {
    try {
      AudioNodeProto.connect = function(...args) {
        const route = inlineRoutes.get(this);
        if (route?.output) return OriginalAudioNodeConnect.call(route.output, ...args);
        return OriginalAudioNodeConnect.call(this, ...args);
      };
      if (OriginalAudioNodeDisconnect) AudioNodeProto.disconnect = function(...args) {
        const route = inlineRoutes.get(this);
        if (route?.output) return OriginalAudioNodeDisconnect.call(route.output, ...args);
        return OriginalAudioNodeDisconnect.call(this, ...args);
      };
    } catch (_) {}
  }

  const state = { enabled: true, phase: 'work', mode: 'steady', nextPhase: null, duration: 0, userVolume: 1, seq: 0 };
  const chains = new Set();
  const connectedMedia = new Set();
  let ctx = null;
  let animationToken = 0;
  let impulseByContext = new WeakMap();

  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
  const mediaElements = () => {
    try {
      return [...new Set([...document.querySelectorAll('audio,video'), ...connectedMedia])]
        .filter(el => el instanceof HTMLMediaElement);
    } catch (_) { return [...connectedMedia]; }
  };

  function emitStatus(extra = {}) {
    try {
      const media = mediaElements();
      const playing = media.filter(el => { try { return !el.paused && !el.ended; } catch (_) { return false; } }).length;
      window.postMessage({ source: STATUS_SOURCE, payload: {
        engine: 'spotify-inline-fx-v520', ready: !!ctx, connected: chains.size,
        mediaCount: media.length, playing, phase: state.phase, mode: state.mode,
        userVolume: state.userVolume, audioContextState: ctx?.state || 'waiting-for-spotify-context',
        framePath: location.pathname, ...extra, at: Date.now()
      } }, '*');
    } catch (_) {}
  }

  function makeImpulse(audioCtx, seconds = 0.92, decay = 5.7) {
    if (impulseByContext.has(audioCtx)) return impulseByContext.get(audioCtx);
    const length = Math.max(1, Math.floor(audioCtx.sampleRate * seconds));
    const impulse = audioCtx.createBuffer(2, length, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let smooth = 0, slow = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        smooth = smooth * 0.88 + white * 0.12;
        slow = slow * 0.97 + smooth * 0.03;
        const x = i / Math.max(1, length - 1);
        const bloom = Math.min(1, Math.max(0, (i - audioCtx.sampleRate * 0.018) / (audioCtx.sampleRate * 0.095)));
        data[i] = (smooth * 0.72 + slow * 0.28) * Math.exp(-decay * x) * bloom * 0.22;
      }
    }
    impulseByContext.set(audioCtx, impulse);
    return impulse;
  }

  function targetForPhase(phase) {
    if (phase === 'break') {
      // ORIGINAL v5.19.8 break tone/mix. Keep these values in sync with the source build.
      return { lowpass: 3900, highShelf: -10.5, lowShelf: 1.8, warmMid: 3.8, melodicMid: 3.0, ratio: 2.15, dry: 0.18, wet: 0.17, master: 1 };
    }
    return { lowpass: 19000, highShelf: 0, lowShelf: 0, warmMid: 0, melodicMid: 0, ratio: 1.2, dry: 1, wet: 0.0001, master: 1 };
  }

  function boundaryTarget(fromPhase) {
    // ORIGINAL v5.19.8 boundary targets.
    return fromPhase === 'break'
      ? { lowpass: 6100, highShelf: -7, lowShelf: 1.1, warmMid: 2.7, melodicMid: 2.2, ratio: 1.8, dry: 0.34, wet: 0.11, master: 1 }
      : { lowpass: 7600, highShelf: -4.5, lowShelf: 0.6, warmMid: 1.8, melodicMid: 1.4, ratio: 1.5, dry: 0.58, wet: 0.085, master: 1 };
  }

  function ramp(audioCtx, param, target, seconds) {
    if (!param || !audioCtx) return;
    const at = audioCtx.currentTime, d = Math.max(0.03, Number(seconds) || 0.03);
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
      else { const current = Number(param.value) || 0; param.cancelScheduledValues(at); param.setValueAtTime(current, at); }
      param.linearRampToValueAtTime(target, at + d);
    } catch (_) { try { param.setTargetAtTime(target, at, Math.max(0.02, d / 4)); } catch (_) {} }
  }

  function ensureReverbReady(chain) {
    if (!chain?.convolver || chain.convolver.buffer) return true;
    try {
      chain.convolver.buffer = makeImpulse(chain.ctx);
      emitStatus({ event: 'reverb-ready' });
      return true;
    } catch (error) {
      emitStatus({ event: 'reverb-build-failed', error: String(error?.message || error) });
      return false;
    }
  }

  function primeReverbForPlayingMedia() {
    for (const chain of chains) {
      try {
        if (chain.el && !chain.el.paused && !chain.el.ended) ensureReverbReady(chain);
      } catch (_) {}
    }
  }

  function applyChainTarget(chain, target, seconds) {
    const c = chain.ctx;
    ramp(c, chain.lowpass.frequency, target.lowpass, seconds);
    ramp(c, chain.highShelf.gain, target.highShelf, seconds);
    ramp(c, chain.lowShelf.gain, target.lowShelf, seconds);
    ramp(c, chain.warmMid.gain, target.warmMid, seconds);
    ramp(c, chain.melodicMid.gain, target.melodicMid, seconds);
    ramp(c, chain.compressor.ratio, target.ratio, seconds);
    ramp(c, chain.dryGain.gain, target.dry, seconds);
    ramp(c, chain.verbGain.gain, target.wet, seconds);
    chain.master = clamp(target.master, 0, 1.08);
    ramp(c, chain.userGain.gain, state.userVolume * chain.master, Math.max(0.8, Math.min(6.5, Number(seconds)||0.8)));
  }

  function applyAllAudio(target, seconds) { for (const chain of chains) applyChainTarget(chain, target, seconds); }

  function setPitchPreserve(el, preserve) {
    try {
      el.preservesPitch = preserve;
      el.webkitPreservesPitch = preserve;
      el.mozPreservesPitch = preserve;
    } catch (_) {}
  }
  function setRate(el, rate, preservePitch) {
    try {
      setPitchPreserve(el, preservePitch);
      const target = clamp(rate, 0.80, 1.08);
      if (target === 1 || Math.abs(Number(el.playbackRate || 1) - target) > 0.0005) el.playbackRate = target;
    } catch (_) {}
  }

  // ORIGINAL v5.19.8 steady playback target. This is applied without retriggering
  // the phase animation when a new track is loaded during break.
  function steadyRate(phase) { return phase === 'break' ? 0.987 : 1.0; }
  function applySteadyRate(el, phase) { setRate(el, steadyRate(phase), true); }

  // Keep the original v5.19.8 tone/EQ/reverb profile, but make pitch travel gentler.
  // break -> focus is intentionally asymmetric: no wobble, no mid-transition
  // preservesPitch toggle, no restart from the old base rate, and no early snap to 1.0.
  function animatePlayback(fromPhase, toPhase, seconds, kind) {
    const token = ++animationToken;
    const start = performance.now();
    const exitToFocus = fromPhase === 'break' && toPhase === 'work';
    const requested = Math.max(0.35, Number(seconds) || 3);
    const durationScale = exitToFocus ? (kind === 'settle' ? 2.4 : 1.0) : 1.45;
    const duration = Math.max(350, requested * 1000 * durationScale);
    const fromBase = fromPhase === 'break' ? 0.987 : 1.0;
    const toBase = toPhase === 'break' ? 0.987 : 1.0;
    const startingRates = new WeakMap();
    for (const el of mediaElements()) {
      const current = Number(el.playbackRate);
      startingRates.set(el, Number.isFinite(current) && current > 0 ? current : fromBase);
    }

    function frame(now) {
      if (token !== animationToken) return;
      const p = clamp((now - start) / duration, 0, 1);
      const ease = p * p * p * (p * (p * 6 - 15) + 10); // smootherstep

      if (exitToFocus) {
        // Finish the 3-second pre-boundary drift near normal speed, then glide the
        // remaining tiny pitch difference to 1.0 with no wobble or mode switch.
        const target = kind === 'boundary' ? 0.996 : 1.0;
        for (const el of mediaElements()) {
          const initial = startingRates.get(el) ?? (Number(el.playbackRate) || fromBase);
          setRate(el, initial + (target - initial) * ease, false);
        }
      } else {
        let base;
        let wobble = 0;
        let preserve = true;
        const smooth = p * p * (3 - 2 * p);
        if (kind === 'boundary') {
          base = fromBase + (0.993 - fromBase) * smooth;
          wobble = Math.sin(p * Math.PI * 2.0) * 0.0012 * Math.sin(p * Math.PI);
          preserve = false;
        } else {
          base = fromBase + (toBase - fromBase) * smooth;
          wobble = Math.sin(p * Math.PI * 1.5) * 0.00045 * (1 - smooth);
          preserve = p > 0.45;
        }
        for (const el of mediaElements()) setRate(el, base + wobble, preserve);
      }

      if (p < 1) requestAnimationFrame(frame);
      else {
        for (const el of mediaElements()) applySteadyRate(el, toPhase);
        // Only switch pitch preservation after the rate is exactly back at 1.0.
        if (exitToFocus) for (const el of mediaElements()) setPitchPreserve(el, true);
      }
    }
    requestAnimationFrame(frame);
    return duration;
  }

  function buildInlineChain(audioCtx, source, el) {
    ctx = audioCtx;
    const lowpass = audioCtx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 19000; lowpass.Q.value = 0.35;
    const highShelf = audioCtx.createBiquadFilter(); highShelf.type = 'highshelf'; highShelf.frequency.value = 4200; highShelf.gain.value = 0;
    const lowShelf = audioCtx.createBiquadFilter(); lowShelf.type = 'lowshelf'; lowShelf.frequency.value = 180; lowShelf.gain.value = 0;
    const warmMid = audioCtx.createBiquadFilter(); warmMid.type = 'peaking'; warmMid.frequency.value = 560; warmMid.Q.value = 0.72; warmMid.gain.value = 0;
    const melodicMid = audioCtx.createBiquadFilter(); melodicMid.type = 'peaking'; melodicMid.frequency.value = 1280; melodicMid.Q.value = 0.88; melodicMid.gain.value = 0;
    const compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -26; compressor.knee.value = 24; compressor.ratio.value = 1.2; compressor.attack.value = 0.018; compressor.release.value = 0.5;
    const dryGain = audioCtx.createGain(); dryGain.gain.value = 1;
    const convolver = audioCtx.createConvolver(); convolver.normalize = true; convolver.buffer = null;
    const verbLowpass = audioCtx.createBiquadFilter(); verbLowpass.type = 'lowpass'; verbLowpass.frequency.value = 3300; verbLowpass.Q.value = 0.2;
    const verbHighpass = audioCtx.createBiquadFilter(); verbHighpass.type = 'highpass'; verbHighpass.frequency.value = 190; verbHighpass.Q.value = 0.25;
    const verbGain = audioCtx.createGain(); verbGain.gain.value = 0.0001;
    const limiter = audioCtx.createDynamicsCompressor(); limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
    const userGain = audioCtx.createGain(); userGain.gain.value = state.userVolume;

    const nativeSourceConnect = OriginalAudioNodeConnect
      ? (...args) => OriginalAudioNodeConnect.call(source, ...args)
      : source.connect.bind(source);
    nativeSourceConnect(lowpass);
    lowpass.connect(highShelf); highShelf.connect(lowShelf); lowShelf.connect(warmMid); warmMid.connect(melodicMid); melodicMid.connect(compressor);
    compressor.connect(dryGain); dryGain.connect(limiter);
    compressor.connect(convolver); convolver.connect(verbLowpass); verbLowpass.connect(verbHighpass); verbHighpass.connect(verbGain); verbGain.connect(limiter);
    limiter.connect(userGain);

    // Keep Spotify's own downstream graph. The AudioNode.connect hook above reroutes
    // only this source's later Spotify connection through userGain. Nothing is wired
    // directly to audioCtx.destination here.
    inlineRoutes.set(source, { output: userGain });
    if (!OriginalAudioNodeConnect) {
      // Very old/mock environments: use an instance-level fallback.
      const outputConnect = userGain.connect.bind(userGain), outputDisconnect = userGain.disconnect.bind(userGain);
      try { source.connect = (...args) => outputConnect(...args); source.disconnect = (...args) => outputDisconnect(...args); } catch (_) {}
    }

    const chain = { ctx: audioCtx, source, el, lowpass, highShelf, lowShelf, warmMid, melodicMid, compressor, dryGain, convolver, verbLowpass, verbHighpass, verbGain, limiter, userGain, master: 1 };
    chains.add(chain); connectedMedia.add(el);
    applyChainTarget(chain, state.enabled ? targetForPhase(state.phase) : targetForPhase('work'), 0.06);
    applySteadyRate(el, state.enabled ? state.phase : 'work');
    emitStatus({ event: 'media-inline-connected' });
    return source;
  }

  function applySteady(phase, seconds = 0.8) {
    const next = phase === 'break' ? 'break' : 'work';
    state.phase = next; state.mode = 'steady'; state.nextPhase = null;
    ++animationToken;
    if (next === 'break') primeReverbForPlayingMedia();
    applyAllAudio(targetForPhase(next), seconds);
    for (const el of mediaElements()) applySteadyRate(el, next);
    emitStatus({ event: 'steady', rate: steadyRate(next), soundProfile: 'original-v5.19.8' });
  }

  function beginBoundary(nextPhase, seconds = 3) {
    const current = state.phase === 'break' ? 'break' : 'work';
    const next = nextPhase === 'break' ? 'break' : 'work';
    state.mode = 'boundary'; state.nextPhase = next;
    if (next === 'break') primeReverbForPlayingMedia();
    applyAllAudio(boundaryTarget(current), seconds);
    animatePlayback(current, next, seconds, 'boundary');
    emitStatus({ event: 'boundary-start', nextPhase: next, soundProfile: 'original-v5.19.8' });
  }

  function settleInto(phase, seconds = 3) {
    const from = state.phase === 'break' ? 'break' : 'work';
    const next = phase === 'break' ? 'break' : 'work';
    state.phase = next; state.mode = 'settling'; state.nextPhase = null;
    if (next === 'break') primeReverbForPlayingMedia();
    applyAllAudio(targetForPhase(next), seconds);
    const animationMs = animatePlayback(from, next, seconds, 'settle');
    const tokenAtStart = animationToken;
    setTimeout(() => {
      if (state.phase !== next || tokenAtStart !== animationToken) return;
      state.mode = 'steady';
      for (const el of mediaElements()) applySteadyRate(el, next);
      emitStatus({ event: 'settled', rate: steadyRate(next), soundProfile: 'original-v5.19.8-soft-exit' });
    }, Math.max(300, animationMs + 80));
  }

  function handleCommand(cmd = {}) {
    if (cmd.seq && cmd.seq === state.seq) return;
    if (cmd.seq) state.seq = cmd.seq;
    if (cmd.userVolume != null && Number.isFinite(Number(cmd.userVolume))) state.userVolume = clamp(cmd.userVolume, 0, 1);
    if (cmd.enabled !== undefined) state.enabled = cmd.enabled !== false;
    for (const chain of chains) ramp(chain.ctx, chain.userGain.gain, state.userVolume * chain.master, 0.08);
    for (const el of mediaElements()) { try { el.volume = 1; } catch (_) {} }
    if (cmd.controlOnly === 'volume') { emitStatus({ event: 'volume' }); return; }
    if (!state.enabled) { applySteady('work', Number(cmd.duration) || 0.2); return; }
    if (cmd.mode === 'boundary') { beginBoundary(cmd.nextPhase, Number(cmd.duration) || 3); return; }
    if (cmd.mode === 'settle') { settleInto(cmd.phase, Number(cmd.duration) || 3); return; }
    applySteady(cmd.phase, Number(cmd.duration) || 0.8);
  }

  const WrappedAudioContext = class extends OriginalAudioContext {
    constructor(...args) {
      super(...args);
      if (!ctx) ctx = this;
      emitStatus({ event: 'spotify-context-seen' });
    }
    createMediaElementSource(el) {
      const source = OriginalAudioContext.prototype.createMediaElementSource.call(this, el);
      try { return buildInlineChain(this, source, el); }
      catch (error) { emitStatus({ event: 'inline-connect-failed', error: String(error?.message || error) }); return source; }
    }
  };

  try {
    window.AudioContext = WrappedAudioContext;
    if ('webkitAudioContext' in window) window.webkitAudioContext = WrappedAudioContext;
  } catch (_) {}

  ['play','playing','canplay','loadedmetadata'].forEach(evt => {
    document.addEventListener(evt, e => {
      if (!(e.target instanceof HTMLMediaElement)) return;
      connectedMedia.add(e.target);
      // Only set a stable target when media is newly activated. Do not reassert it
      // on a timer; that old timer was the source of random audible pitch jumps.
      if (state.mode === 'steady') applySteadyRate(e.target, state.enabled ? state.phase : 'work');
      if (evt === 'playing' || evt === 'canplay') {
        try { if (ctx?.state === 'suspended') ctx.resume().catch(()=>{}); } catch (_) {}
        // Reverb is intentionally built only after media is actually available, never on startup.
        if (state.enabled && state.phase === 'break') primeReverbForPlayingMedia();
        else if (evt === 'playing') setTimeout(() => primeReverbForPlayingMedia(), 2200);
      }
      emitStatus({ event: `media-${evt}` });
    }, true);
  });

  window.addEventListener('message', e => {
    if (e.data?.source === BRIDGE_SOURCE) handleCommand(e.data.payload || {});
  });

  const start = () => emitStatus({ event: 'script-ready' });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
