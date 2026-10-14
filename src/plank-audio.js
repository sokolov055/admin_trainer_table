// Авторские звуковые задания и фон синтезируются на устройстве.
export function createPlankAudio() {
  let context, backgroundTimer, finishTimer, resolveClip, epoch = 0;
  const voices = new Set();
  const ensure = async () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Звук недоступен в этом браузере. Выберите другую категорию.');
    if (!context || context.state === 'closed') context = new Audio();
    await context.resume();
    if (context.state !== 'running') throw new Error('Браузер заблокировал звук. Нажмите «Слушать» ещё раз.');
  };
  const note = (frequency, at, duration = .12, volume = .08) => {
    const osc = context.createOscillator(), gain = context.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .015);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain); gain.connect(context.destination); voices.add(osc);
    osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(at); osc.stop(at + duration + .02);
  };
  const stopBackground = () => { clearInterval(backgroundTimer); backgroundTimer = null; };
  const stop = () => {
    epoch += 1;
    stopBackground(); clearTimeout(finishTimer);
    for (const osc of voices) { try { osc.stop(); } catch (_) {} }
    resolveClip?.(false); resolveClip = null;
  };
  return {
    async play(clip) {
      stop(); const ownEpoch = epoch; await ensure();
      if (ownEpoch !== epoch) return false;
      const at = context.currentTime + .03;
      let duration;
      if (clip.chord) { clip.chord.forEach(f => note(f, at, 1.4, .035)); duration = 1.5; }
      else if (clip.notes) { clip.notes.forEach((f, i) => note(f, at + i * .55, .4)); duration = clip.notes.length * .55; }
      else {
        const count = clip.beats || 6, gap = 60 / clip.bpm;
        for (let i = 0; i < count; i++) note(clip.meter && i % clip.meter === 0 ? 880 : 440, at + i * gap);
        duration = count * gap;
        if (clip.secondBpm) { const nextGap = 60 / clip.secondBpm; for (let i = 0; i < count; i++) note(440, at + duration + .4 + i * nextGap); duration += .4 + count * nextGap; }
      }
      return new Promise(resolve => { resolveClip = resolve; finishTimer = setTimeout(() => { resolveClip = null; resolve(true); }, (duration + .1) * 1000); });
    },
    unlock: ensure,
    stopBackground,
    async background() {
      await ensure(); stopBackground();
      const phrase = () => { [130.81, 164.81, 196, 164.81].forEach((f, i) => note(f, context.currentTime + .03 + i * .65, .5, .015)); };
      phrase(); backgroundTimer = setInterval(phrase, 2600);
    },
    stop,
    close() { stop(); if (context && context.state !== 'closed') context.close(); },
  };
}
