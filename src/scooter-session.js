import { createGame, pause } from './scooter-model.js';

// Одна поездка на текущего пользователя, только в памяти. Меню и отдых
// могут одновременно быть смонтированы, но часы ведёт только верхняя сцена.
export function createScooterSession() {
  const game = createGame();
  const owners = [];
  return {
    game,
    owner: () => owners.at(-1),
    pause: () => pause(game),
    claim(owner) {
      pause(game);
      owners.push(owner);
      return () => {
        const index = owners.indexOf(owner);
        if (index < 0) return;
        if (owners.at(-1) === owner) pause(game);
        owners.splice(index, 1);
      };
    },
  };
}
