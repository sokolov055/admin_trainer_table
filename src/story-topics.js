/**
 * Темы историй под человека и устройство (FT-615) — без React, чтобы это
 * проверял тест (scripts/test-stories-edit.mjs).
 *
 * Кому показывать (audience — всем, клиентам, тренерам), без скрытых
 * кадров (hidden — из панели владельца), на iPhone без кадров «только
 * Android», не на iPhone — без «только iPhone» (Apple Watch), и с текстом
 * для iPhone там, где он свой (bodyIos). Тема без кадров не показывается —
 * пустой кружок обещал бы то, чего нет.
 */
export function prepareTopics(raw, { role = 'client', ios = false } = {}) {
  const mine = role === 'trainer' ? 'trainers' : 'clients';
  return (raw || [])
    .filter((topic) => !topic.audience || topic.audience === 'all' || topic.audience === mine)
    .map((topic) => ({
      ...topic,
      frames: (topic.frames || [])
        .filter((frame) => !frame.hidden && !(ios && frame.only === 'android') && !(!ios && frame.only === 'ios'))
        .map((frame) => (ios && frame.bodyIos ? { ...frame, body: frame.bodyIos } : frame)),
    }))
    .filter((topic) => topic.frames.length > 0);
}
