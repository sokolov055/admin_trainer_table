import test from 'node:test';
import assert from 'node:assert/strict';
import { pavingRows, walkingFrame } from '../src/scooter-motion.js';
import { createScooterVoice } from '../src/scooter-voice.js';

test('плитка сохраняет раскладку мира при переходе камеры через границу ряда', () => {
  const before = pavingRows(43.9, 500), after = pavingRows(44.1, 500);
  for (const row of before.filter(r => r.y > 0 && r.y < 450)) {
    const next = after.find(r => r.index === row.index);
    assert.equal(next.shift, row.shift); assert.ok(Math.abs(next.y - row.y - .2) < 1e-8);
  }
});
test('шаг каждого НПС проходит четыре позы и останавливается вместе с игровым временем', () => {
  for (const type of ['runner', 'grandma', 'athlete']) {
    const frames = new Set(Array.from({ length: 60 }, (_, i) => walkingFrame(type, i / 30)));
    assert.equal(frames.size, 4);
  }
});
test('гневные голоса различаются по персонажу и не используют сетевой синтез', () => {
  const calls = [], synth = { getVoices: () => [{name:'Cloud',lang:'ru-RU',localService:false},{name:'Milena',lang:'ru-RU',localService:true}], speak: s => calls.push(s), cancel() {} };
  const voice = createScooterVoice(synth, class { constructor(text) { this.text = text; } });
  voice.unlock(); assert.equal(calls[0].volume, 0);
  voice.speak({speaker:'grandma',text:'Куда летишь?!'}); const high=calls.at(-1).pitch;
  voice.speak({speaker:'athlete',text:'У меня ноги!'}); assert.ok(calls.at(-1).pitch<high);
  assert.ok(calls.every(s=>s.voice.localService));
  synth.getVoices=()=>[{lang:'ru-RU',localService:false}]; assert.equal(voice.speak({text:'Эй!'}),false);
});
