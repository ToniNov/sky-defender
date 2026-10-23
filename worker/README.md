# API игры (Cloudflare Workers + D1)

Сервер для таблицы лидеров. Игрок подтверждается подписью Telegram:
клиент шлёт заголовок `Authorization: tma <Telegram.WebApp.initData>`, сервер проверяет её токеном бота (`src/initData.ts`).

| Запрос | Что делает |
|---|---|
| `GET /api/health` | `{ ok: true }` |
| `GET /api/leaderboard` | `{ top: [{ name, score }], me: { rank, score } \| null }` — топ-50; `me` только с Authorization |
| `POST /api/score` | тело `{ score }` → `{ best, rank }`; хранится лучший результат игрока |

## Локально

```bash
echo 'BOT_TOKEN=123456:TEST-token' > worker/.dev.vars   # любой токен; файл в .gitignore
npm run api:migrate:local                                # создать таблицы в локальной D1
npm run api:dev                                          # http://localhost:8787
```

Вне Telegram настоящей initData нет — для ручной проверки её можно подписать тем же тестовым токеном
(см. `makeInitData` в `src/initData.test.ts`).

## Первый деплой

```bash
npx wrangler login
npx wrangler d1 create sky-defender        # id базы вписать в database_id в wrangler.toml
npm run api:migrate                        # таблицы в боевой базе
npx wrangler secret put BOT_TOKEN -c worker/wrangler.toml   # токен бота от @BotFather
npm run api:deploy                         # выдаст адрес вида https://sky-defender-api.<аккаунт>.workers.dev
```

Новая таблица или колонка — новый файл `migrations/000N_*.sql`, затем `npm run api:migrate`.
Домены, с которых игре можно ходить в API, — `ALLOWED_ORIGINS` в `wrangler.toml`.
