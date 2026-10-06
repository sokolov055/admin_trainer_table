const DAY = 86400000;

/** Новое начало после перетаскивания в часовой сетке: дни и получасы. */
export function gridDropStart(startsAt, dx, dy, columnWidth, hourHeight) {
  const start = new Date(startsAt).getTime();
  const days = Math.round(dx / Math.max(1, columnWidth));
  const halfHours = Math.round(dy / Math.max(1, hourHeight) * 2);
  return new Date(start + days * DAY + halfHours * 30 * 60000);
}

/** Новое начало после перетаскивания между ячейками месяца. */
export function monthDropStart(startsAt, dx, dy, cellWidth, cellHeight) {
  const days = Math.round(dx / Math.max(1, cellWidth)) + Math.round(dy / Math.max(1, cellHeight)) * 7;
  return new Date(new Date(startsAt).getTime() + days * DAY);
}

/** Один запрос переноса для занятия и личного события. */
export function moveRequest(event, nextStart) {
  const minutes = Math.max(15, Math.round((new Date(event.endsAt) - new Date(event.startsAt)) / 60000));
  const personal = event.personal === true;
  return {
    id: event.id,
    personal,
    ...(personal ? { title: event.title } : { clientRow: Number(event.clientRow), change: 'trainer' }),
    startsAt: nextStart.toISOString(),
    minutes,
  };
}
