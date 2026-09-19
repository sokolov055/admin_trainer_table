# Инструкции для Claude Code

Этот каталог — отдельный репозиторий фронтенда `sokolov055/admin_trainer_table`.
Основная ветка: `main`. Родительский каталог является другим репозиторием.

Перед работой выполни `git pull --ff-only origin main` именно внутри `webapp/`. Не коммить `.env`, `.env.demo`, `node_modules` и `dist`.

## Проверка и публикация

```bash
npm ci
npm run build
```

После успешной сборки сделай коммит и push в `main`. Workflow `.github/workflows/deploy.yml` автоматически публикует GitHub Pages:

`https://sokolov055.github.io/admin_trainer_table/`

Переменная `VITE_API_URL` для production берётся из GitHub Actions secret. Не записывай секретные значения в исходники или workflow.

После push проверь успешное завершение workflow `Deploy`. API на VPS разворачивается из соседнего основного репозитория по инструкции `../CLAUDE.md`; не копируй серверные секреты во фронтенд.
