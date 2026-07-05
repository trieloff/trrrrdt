/*
 * Shared file-audio engine for the player blocks (turntable, yunost).
 * Two <audio> elements crossfaded on track change, plus a Web Audio analyser
 * that yields bass/mid/treble levels for the visualizer. Suno's CDN sends
 * ACAO:* so anonymous mode keeps the analysis legal; cross-origin/DRM sources
 * (e.g. Apple via MusicKit) run their own audio and simply return null levels.
 */

const FADE_MS = 400;

export default function createAudioEngine() {
  const players = [new Audio(), new Audio()];
  players.forEach((p) => {
    p.preload = 'auto';
    p.loop = false;
    p.crossOrigin = 'anonymous';
  });
  let active = 0;
  let fadeFrame = null;
  let analyser = null;
  let freqData = null;
  const levels = { bass: 0, mid: 0, treble: 0 };

  function ensureAnalyser() {
    if (analyser !== null) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      players.forEach((p) => {
        const source = ctx.createMediaElementSource(p);
        source.connect(analyser);
      });
      analyser.connect(ctx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      analyser = false; // tried and failed — stay element-only, no analysis
    }
  }

  function fadeTo(inPlayer, outPlayer) {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / FADE_MS, 1);
      inPlayer.volume = t;
      outPlayer.volume = 1 - t;
      if (t < 1) {
        fadeFrame = requestAnimationFrame(step);
      } else {
        outPlayer.pause();
        fadeFrame = null;
      }
    }
    fadeFrame = requestAnimationFrame(step);
  }

  function bandAverage(from, to) {
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += freqData[i];
    return sum / ((to - from) * 255);
  }

  return {
    async play(src) {
      ensureAnalyser();
      const next = players[1 - active];
      const prev = players[active];
      if (next.src !== src) next.src = src;
      next.volume = 0;
      await next.play();
      active = 1 - active;
      fadeTo(next, prev);
    },
    pause() {
      players.forEach((p) => p.pause());
    },
    onEnded(callback) {
      players.forEach((p) => p.addEventListener('ended', () => {
        if (p === players[active]) callback();
      }));
    },
    /* bass / mid / treble in 0..1, or null when analysis is unavailable */
    getLevels() {
      if (!analyser || !freqData) return null;
      analyser.getByteFrequencyData(freqData);
      levels.bass = bandAverage(1, 4);
      levels.mid = bandAverage(4, 24);
      levels.treble = bandAverage(24, 96);
      return levels;
    },
  };
}
