// «Блины»: короткие звуки синтезируются на устройстве после действия игрока —
// бросок, стук вставки, снятие блинов (выше с каждым звеном цепи), бонус, тревога у помоста.
const NOTES = {
  shot: [[180, .03, 'triangle', .05]],
  insert: [[120, .05, 'sine', .07]],
  power: [[880, .06, 'sine', .04], [1175, .08, 'sine', .04]],
  danger: [[150, .14, 'square', .025], [150, .14, 'square', .025]],
  won: [[523, .12, 'sine', .055], [659, .12, 'sine', .055], [784, .12, 'sine', .055], [1047, .2, 'sine', .055]],
  lost: [[330, .16, 'triangle', .05], [262, .16, 'triangle', .05], [196, .28, 'triangle', .05]],
};

export function createBliniAudio() {
  let context = null;
  const voices = new Set();
  const tone = (frequency, length, type, volume, at) => {
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .008);
    gain.gain.exponentialRampToValueAtTime(.001, at + length + .05);
    oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at); oscillator.stop(at + length + .08);
  };
  return {
    async unlock() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      try { context ||= new Audio(); await context.resume(); return true; }
      catch (error) { console.warn('Звук игры недоступен', error); return false; }
    },
    play(kind, depth = 1) {
      if (!context || context.state !== 'running') return;
      const notes = kind === 'clear'
        ? [440, 554, 659].map((f, i) => [f * (1 + Math.min(depth - 1, 5) * .12), .1 + i * .02, 'sine', .05])
        : NOTES[kind];
      if (!notes) return;
      let at = context.currentTime;
      for (const [frequency, length, type, volume] of notes) { tone(frequency, length, type, volume, at); at += kind === 'clear' ? .05 : length * .8; }
    },
    stop() { for (const voice of voices) { try { voice.stop(); } catch (_) { /* уже завершён */ } } voices.clear(); },
    close() { this.stop(); if (context) { context.close().catch(() => {}); context = null; } },
  };
}
