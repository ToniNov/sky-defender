# API игры (Cloudflare Workers + D1)

Сервер для таблицы лидеров. Игрок подтверждается подписью Telegram:
клиент шлёт заголовок `Authorization: tma <Telegram.WebApp.initData>`, сервер проверяет её токеном бота (`src/initData.ts`).

| Запрос | Что делает |
|---|---|
| `GET /api/health` | `{ ok: true }` |
| `GET /api/leaderboard` | `{ top: [{ name, score }], me: { rank, score } \| null }` — топ-50; `me` только с Authorization |
| `POST /api/score` | тело `{ score }` → `{ best, rank }`; хранится лучший результат игрока |
| `GET /api/referrals` | `{ link, invited, unclaimed }`: ссылка-приглашение `…?startapp=ref_<id>`, сколько друзей пришло, за скольких награда не забрана |
| `POST /api/referrals/claim` | `{ claimed }`: отмечает награду забранной; монеты (`REFERRAL.reward` за друга) начисляет игра |
| `POST /api/share` | тело `{ score }` → `{ id }`: сообщение с результатом, подготовленное через Bot API `savePreparedInlineMessage`; игра открывает его в `WebApp.shareMessage(id)` |

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

Для «Поделиться результатом» впиши в `APP_URL` (`wrangler.toml`) ссылку на мини-апп из BotFather,
например `https://t.me/<бот>/<приложение>`: она станет кнопкой «Играть» в сообщении и основой ссылок-приглашений.
Пока там пусто, `/api/share` отвечает 503, а приглашения недоступны.

Друг засчитывается, когда новый игрок, открывший игру по ссылке, впервые присылает результат партии,
и только если пригласивший сам уже играл. Кто играл раньше, тот по ссылке не засчитывается.

Адрес воркера игра берёт при сборке из `VITE_API_URL`. Для GitHub Pages:
**Settings → Secrets and variables → Actions → Variables → New repository variable**, имя `API_URL`,
значение — адрес из `api:deploy` (без `/` в конце). Затем пересобрать игру (push в `main` или ручной запуск деплоя).
Локально: `VITE_API_URL=http://localhost:8787 npm run dev`.

Новая таблица или колонка — новый файл `migrations/000N_*.sql`, затем `npm run api:migrate`.
Домены, с которых игре можно ходить в API, — `ALLOWED_ORIGINS` в `wrangler.toml`.
