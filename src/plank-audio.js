// Авторские эффекты, музыка и задания. Всё синтезируется на устройстве.
export function createPlankAudio() {
  let context, backgroundTimer, finishTimer, resolveClip, epoch = 0, musicEpoch = 0;
  const voices = new Map();
  const ensure = async () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Звук недоступен. Для звуковых вопросов выберите другую категорию.');
    if (!context || context.state === 'closed') context = new Audio();
    await context.resume();
    if (context.state !== 'running') throw new Error('Не удалось включить звук. Нажмите кнопку звука ещё раз.');
  };
  const note = (frequency, at, duration = .12, volume = .06, group = 'clip', type = 'sine', endFrequency) => {
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, at);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .008);
    gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    osc.connect(gain); gain.connect(context.destination); voices.set(osc, group);
    osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(at); osc.stop(at + duration + .02);
  };
  const stopGroup = group => { for (const [osc, kind] of voices) if (!group || kind === group) { try { osc.stop(); } catch (_) { /* уже завершён */ } } };
  const stopBackground = () => { musicEpoch += 1; clearInterval(backgroundTimer); backgroundTimer = null; stopGroup('music'); };
  const stop = () => {
    epoch += 1; stopBackground(); clearTimeout(finishTimer); stopGroup();
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
    async effect(kind) {
      const ownEpoch = epoch; await ensure(); if (ownEpoch !== epoch) return;
      const tones = { start: [262, 330, 392], correct: [523, 659, 784], wrong: [220, 164, 110], win: [523, 659, 784, 1047], pause: [392, 262], resume: [262, 392], tick: [880], milestone: [523, 784, 1047, 1319] }[kind] || [440];
      tones.forEach((f, i) => note(f, context.currentTime + .01 + i * .085, kind === 'tick' ? .045 : .22, .035, 'effect', 'triangle'));
    },
    unlock: ensure,
    stopBackground,
    async background() {
      stopBackground(); const ownEpoch = epoch, ownMusic = musicEpoch;
      await ensure(); if (ownEpoch !== epoch || ownMusic !== musicEpoch) return;
      // Восьмидольная петля: упругий бас, тихий пульс и лёгкая мелодия.
      const phrase = () => {
        const at = context.currentTime + .02;
        [130.81, 130.81, 164.81, 196, 146.83, 146.83, 174.61, 196].forEach((f, i) => {
          note(f, at + i * .3, .24, .018, 'music', 'triangle');
          if (i % 2 === 0) note(100, at + i * .3, .12, .025, 'music', 'sine', 45);
          if (i % 2) note(f * 4, at + i * .3, .13, .008, 'music');
        });
      };
      phrase(); backgroundTimer = setInterval(phrase, 2400);
    },
    stop,
    close() { stop(); if (context && context.state !== 'closed') context.close().catch(() => {}); },
  };
}
