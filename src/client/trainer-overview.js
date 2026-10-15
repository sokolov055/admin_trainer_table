/** Общие цифры карточки тренера берём из того же снимка, что и её шапка.
 * Отдельный кеш обзора может пережить несколько списаний и сбой сети. */
export function trainerOverview(data, client, clients = []) {
  if (!client || !data || data.row !== client.row) return data;
  const price = client.price;
  const trainingsLeft = price > 0 ? Math.floor(client.balance / price) : null;
  let payer = data.payer;
  if (client.splitOf) {
    payer = { ...payer, name: client.splitPayerName, balance: client.splitBalance,
      trainingsLeft: client.splitTrainingsLeft, split: true };
  } else if (!client.payer) {
    payer = null;
  } else {
    const paying = clients.find((c) => c.name === client.payer);
    if (paying) payer = { name: paying.name, balance: paying.balance,
      trainingsLeft: price > 0 ? Math.floor(paying.balance / price) : null };
  }
  const left = payer ? payer.trainingsLeft : trainingsLeft;
  const perWeek = data.packageEnding?.perWeek;
  return {
    ...data, balance: client.balance, price, trainingsLeft, payer,
    trainingsThisMonth: client.trainings,
    lastTrainingDate: client.lastTrainingDate,
    nextTrainingDate: client.nextTrainingDate,
    // Онлайн-ведение (FT-530) — из той же строки списка, что и шапка
    online: client.online ? { until: client.onlineUntil || null } : null,
    // У онлайн-клиента пакета занятий нет — и предупреждать не о чем
    packageEnding: { ...data.packageEnding, known: !client.online && left !== null && left !== undefined,
      left, soon: left > 0 && left <= perWeek, out: left !== null && left <= 0 },
  };
}
