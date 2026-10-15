// Короткие авторские звуки синтезируются на устройстве после действия игрока.
export function createMatchAudio() {
  let context = null;
  const voices = new Set();
  return {
    async unlock() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      try { context ||= new Audio(); await context.resume(); return true; }
      catch (error) { console.warn('Звук игры недоступен', error); return false; }
    },
    play(combo = 1, win = false) {
      if (!context || context.state !== 'running') return;
      const notes = win ? [523, 659, 784, 1047] : [440 * (1 + Math.min(combo - 1, 5) * .12), 660 * (1 + Math.min(combo - 1, 5) * .12)];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        const at = context.currentTime + index * .055;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.055, at + .009);
        gain.gain.exponentialRampToValueAtTime(.001, at + .18);
        oscillator.connect(gain); gain.connect(context.destination); voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + .2);
      });
    },
    stop() { for (const voice of voices) { try { voice.stop(); } catch (_) { /* уже завершён */ } } voices.clear(); },
    close() { this.stop(); if (context) { context.close().catch(() => {}); context = null; } },
  };
}
