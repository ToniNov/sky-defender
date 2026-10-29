# API игры (Cloudflare Workers + D1)

Сервер для таблицы лидеров. Игрок подтверждается подписью Telegram:
клиент шлёт заголовок `Authorization: tma <Telegram.WebApp.initData>`, сервер проверяет её токеном бота (`src/initData.ts`).

| Запрос | Что делает |
|---|---|
| `GET /api/health` | `{ ok: true }` |
| `GET /api/leaderboard` | `{ top: [{ name, score }], me: { rank, score } \| null, friends: [{ name, score, me }] \| null }` — топ-50; `me` и `friends` только с Authorization. Друзья — кого игрок пригласил и кто пригласил его, плюс он сам |
| `POST /api/run` | партия началась: сервер запоминает время старта (одна партия на игрока, новая заменяет прежнюю) |
| `POST /api/score` | тело `{ score }` → `{ best, rank }`; хранится лучший результат игрока. Нет начатой партии — 409, очков больше, чем можно набрать за время партии, — 422 |
| `GET /api/referrals` | `{ link, invited, unclaimed }`: ссылка-приглашение `…?startapp=ref_<id>`, сколько друзей пришло, за скольких награда не забрана |
| `POST /api/referrals/claim` | `{ claimed }`: отмечает награду забранной; монеты (`REFERRAL.reward` за друга) начисляет игра |
| `POST /api/errors` | тело `{ message, stack, version, platform }`: ошибка из игры, без подписи. Одинаковые складываются в одну строку со счётчиком, разных хранится не больше 1000 |
| `POST /api/events` | событие аналитики, без подписи: `{ type: 'launch', device, version, platform }` при запуске или `{ type: 'run', …, score, wave, seconds, cause }` после гибели. `device` — случайный id устройства из игры, не Telegram-id |
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

Защита от накрутки: время партии считает сервер (от `POST /api/run` до `POST /api/score`), а очков можно
прислать не больше `SCORE_HEADROOM + SCORE_PER_SEC × секунды` (`src/players.ts`). На одну партию — один результат.
Отклонённые попытки видны в логах воркера (`npx wrangler tail -c worker/wrangler.toml`) как `implausible score`.

Друг засчитывается, когда новый игрок, открывший игру по ссылке, впервые присылает результат партии,
и только если пригласивший сам уже играл. Кто играл раньше, тот по ссылке не засчитывается.

Адрес воркера игра берёт при сборке из `VITE_API_URL`. Для GitHub Pages:
**Settings → Secrets and variables → Actions → Variables → New repository variable**, имя `API_URL`,
значение — адрес из `api:deploy` (без `/` в конце). Затем пересобрать игру (push в `main` или ручной запуск деплоя).
Локально: `VITE_API_URL=http://localhost:8787 npm run dev`.

Новая таблица или колонка — новый файл `migrations/000N_*.sql`, затем `npm run api:migrate`.
Домены, с которых игре можно ходить в API, — `ALLOWED_ORIGINS` в `wrangler.toml`.

## Ошибки из игры

Игра сама шлёт необработанные ошибки на `POST /api/errors` (`src/errors.ts`): одну и ту же — раз за сессию, всего не больше 5.
Последние 20:

```bash
npm run api:errors
```

Стек — из собранного (сжатого) кода: по версии в отчёте можно собрать ту же версию и найти место.
Очистить таблицу: `npx wrangler d1 execute sky-defender --remote -c worker/wrangler.toml --command "DELETE FROM errors"`.

## Аналитика

Игра шлёт на `POST /api/events` (`src/analytics.ts`) запуск и итог каждой партии: очки, волну, время без пауз и чем сбит (`bullet`, `missile` или вид врага, который протаранил). Партии, брошенные из паузы или закрытием приложения, не попадают. Игрок — случайный id устройства.

```bash
npm run api:stats    # по дням за 14 дней: запуски, игроки, партии, среднее время, очки, волна
npm run api:deaths   # за 7 дней: на какой волне и от чего умирают
npm run api:weapons  # за 7 дней: с каким оружием живут дольше (основное × стартовое)
```

Перед первым запуском — миграция `npm run api:migrate`, потом `npm run api:deploy`.
