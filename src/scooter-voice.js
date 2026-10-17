// Только установленные голоса: реплики не отправляются внешнему синтезатору.
export function createScooterVoice(synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
  let unlocked = false;
  const voices = () => synth?.getVoices().filter(v => v.localService && v.lang.startsWith('ru')) || [];
  function unlock() {
    const voice = voices()[0];
    if (unlocked || !voice || !Utterance) return;
    const silent = new Utterance(' '); silent.voice = voice; silent.lang = voice.lang; silent.volume = 0;
    synth.speak(silent); unlocked = true;
  }
  return {
    unlock,
    speak(event) {
      if (!synth || !Utterance) return false;
      const available = voices();
      const preferred = event.speaker === 'grandma' ? /Milena|Katya|Elena|Милена|Катя/i : /Yuri|Pavel|Dmitri|Юрий|Павел|Дмитрий/i;
      const voice = available.find(v => preferred.test(v.name)) || available[0];
      if (!voice) return false;
      const speech = new Utterance(event.text); speech.voice = voice; speech.lang = voice.lang;
      speech.pitch = event.speaker === 'grandma' ? 1.3 : event.speaker === 'athlete' ? .72 : 1.05;
      speech.rate = event.speaker === 'athlete' ? 1.12 : 1.25; speech.volume = 1;
      synth.cancel(); synth.speak(speech); return true;
    },
    cancel() { synth?.cancel(); },
  };
}
