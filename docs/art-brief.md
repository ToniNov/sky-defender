# Небесный патруль: бриф на графику кораблей

Описания моделей для генерации картинками (нейросети) или для художника.
Сейчас вся графика векторная и рисуется кодом: самолёты игрока — в `src/game/skins.ts`, враги — в `src/game/textures.ts`.
Нарисованные модели заменят их по одной, механика и хитбоксы не меняются.

---

## Где генерировать

| Сервис | Что даёт | Когда брать |
|---|---|---|
| ChatGPT / Gemini (генерация картинок) | Быстро, понимают длинные описания | Первые пробы стиля. Прозрачный фон получается не всегда |
| Scenario | Обучается на 15+ ваших картинках и держит стиль | Целый набор в одном стиле |
| Leonardo.Ai | Универсальный генератор 2D-ассетов | Середнячок на все случаи |
| Stable Diffusion (локально) | Бесплатно, полный контроль | Если готовы повозиться с настройкой |
| Recraft | Отдаёт векторный SVG | Скины уже хранятся как SVG, но сгенерированный SVG надо проверять на парсере Pixi (см. ниже) |

Условия бесплатных тарифов меняются — проверять на сайтах перед началом.

**Порядок работы:**

1. В ChatGPT или Gemini подобрать стиль на 2–3 моделях.
2. Лучший результат прикладывать образцом ко всем следующим генерациям (или обучить на нём Scenario).
3. Весь набор делать в одном сервисе — иначе корабли будут выглядеть как из разных игр.
4. Сохранять удачные промпты и настройки рядом с картинками.

**Первая проба:** Классика, Разведчик и Щитоносец — модель игрока, простой враг и враг, у которого механика видна по внешнему виду. Подключить, посмотреть в бою, и только потом делать остальное.

---

## Общие требования

Этот блок добавляется к каждому промпту (генераторы лучше понимают английский):

```
2D game sprite for a mobile arcade shooter, strict top-down view,
flat vector style with clean bold shapes and soft cel shading,
bright saturated colors that read well on a dark navy space background,
centered, symmetrical, fills ~85% of the canvas, transparent background,
no text, no frame, no ground shadow, no perspective tilt, 1024x1024
```

- **Направление.** Игрок — носом **вверх**, враги — носом **вниз** (к игроку). Строго вид сверху: если ракурс съедет, хитбокс разойдётся с картинкой.
- **Центр.** Центр картинки = центр хитбокса. Ничего не должно сильно торчать в одну сторону.
- **Размер.** Генерировать 1024×1024 (босса — 2048), в игру идёт уменьшенный PNG 256×256. На экране самолёт игрока ~60 px, враги 24–52 px, босс ~90 px.
- **Фон.** Прозрачный. Если не выходит — сплошной розовый `solid magenta #FF00FF background`, его легко вырезать.
- **Цвет вида.** У каждого врага свой цвет (как сейчас): игрок узнаёт врага по цвету и силуэту за доли секунды. Цвета ниже менять только вместе с кодом (`ENEMY_COLOR` в `World.ts` — им окрашиваются взрывы).
- **Читаемость.** Модель должна узнаваться в размере 48 px на тёмном фоне. Мелкие детали пропадут — лучше крупные формы.

---

## Самолёт игрока — 7 скинов (носом вверх)

### Классика — базовая модель
```
small friendly fighter jet, nose pointing UP, white fuselage with a red stripe,
sky-blue swept wings with red wingtips, dark blue glass cockpit near the nose,
small twin tail fins, a glowing orange engine nozzle at the bottom
```

### Закат, Изумруд, Ночь — перекраски Классики
Форма та же, что у Классики — можно не генерировать, а перекрасить её в редакторе. Если генерировать, прикладывать Классику образцом:

- **Закат:** `same jet, orange and peach wings, cream fuselage, yellow wingtips, warm sunset palette`
- **Изумруд:** `same jet, emerald green wings, mint highlights, gold stripe and wingtips`
- **Ночь:** `same jet, matte dark graphite body, thin glowing cyan neon lines on wings and stripe, cyan cockpit`

### Дельта
```
sleek delta-wing interceptor, nose pointing UP, one large triangular crimson wing,
narrow white fuselage running through it, small canards near the cockpit,
twin angled tail fins, aggressive but clean
```

### Стелс
```
angular stealth flying wing, nose pointing UP, faceted dark gray panels,
sharp zigzag trailing edge, small golden cockpit, thin red edge lights on wingtips,
must stay readable on a dark background — use lighter gray facet highlights
```
Главный риск — тёмный самолёт на тёмном фоне. Без светлых граней потеряется.

### Ретро
```
cute retro biplane, nose pointing UP, red double wings with visible struts,
cream wooden fuselage, open cockpit with a pilot in goggles,
spinning propeller blur at the nose, red tail
```

---

## Враги — 7 моделей (носом вниз)

У врагов внешний вид — часть механики: в пункте «Обязательно» то, без чего игрок не поймёт, как с ними бороться.

### Разведчик — зелёный, маленький, быстрый, 1 попадание
```
small green alien scout pod, facing DOWN, round body with big curious eyes
on the front, two antennae, tiny side thrusters, cute but alien, very compact
```
Обязательно: самый маленький и простой силуэт — это «рядовой» враг.

### Тарелка — голубая, качается и стреляет
```
classic flying saucer seen from above, cyan metal disc, glass dome in the center,
ring of glowing lights around the rim, a small gun turret on the bottom edge
```
Обязательно: турель снизу — подсказка, что этот враг стреляет.

### Флагман (босс) — фиолетовый, в 2–3 раза больше остальных
```
huge alien mothership, facing DOWN, wide purple saucer-like hull with armored plates,
glowing magenta core in the center, multiple gun ports along the front edge,
menacing and impressive, much larger and more detailed than other enemies
```
Генерировать 2048×2048. Перед атакой босс подсвечивается цветом атаки (розовый, жёлтый, бирюзовый) — светлые участки корпуса должны эту подсветку принимать, чисто чёрный корпус её не покажет.

### Камикадзе — красно-оранжевый, зависает, целится и таранит
```
red-orange alien dart, facing DOWN, sharp arrow-like shape with a spiked nose,
swept-back fins, bright hot engine glow at the back, looks fast and dangerous
```
Обязательно: острый силуэт наконечника стрелы — «сейчас врежусь». Перед тараном он поворачивается носом на игрока, поэтому нос должен быть очевиден.

### Щитоносец — золотой, снизу прикрыт щитом, бить по краям
```
heavy golden alien tank-ship, facing DOWN, thick armored body,
a large glowing energy shield plate covering ONLY the bottom-center front,
exposed vulnerable sides with visible weak spots (glowing vents) on left and right
```
Обязательно: явный щит по центру снизу и уязвимые бока. Без этого игрок не поймёт, почему пули отскакивают. Ширина щита в игре — 32 px из 52 (`ENEMY.shielder.plateHalf` в `balance.ts`).

### Сплиттер — розовый, при гибели распадается на два осколка
```
pink alien ship made of two identical halves joined by a glowing seam down the middle,
facing DOWN, symmetrical, the seam should clearly show it can split apart
```
Обязательно: шов посередине — подсказка, что он развалится.

### Осколок — половинка сплиттера
```
one half of the pink split alien ship, small, cracked glowing edge on one side,
same colors and style as the splitter
```
Делать после сплиттера, приложив его картинку образцом.

---

## Что не генерировать

Пули, искры, монеты, иконки бонусов, пламя двигателя, кольца щита и магнита. Они мелкие (10–30 px), и векторные выглядят чётче уменьшенной картинки. Менять их имеет смысл, только если меняется весь визуальный стиль игры.

---

## Как подключить

- PNG класть в `src/assets/ships/` (`player-classic.png`, `enemy-scout.png`…), грузить через `Assets.load` — пункт техдолга в `ROADMAP.md`.
- В `skins.ts` / `textures.ts` меняется только источник текстуры. Хитбоксы остаются прежними — баланс не меняется. Если модель заметно больше или меньше хитбокса, подогнать масштаб спрайта, а не хитбокс.
- **Если модель в SVG** (например, из Recraft): парсер Pixi понимает `polygon`, `path`, `rect`, `circle`, `ellipse`, `fill`, `fill-opacity`. В `points` у `polygon` — только целые числа (Pixi читает их как `/-?\d+/`). Проверка — тест в `e2e/skins.spec.ts`.
- После подключения — посмотреть в бою: на тёмном фоне, в движении, рядом с пулями и искрами.

---

Источники по инструментам:
[Abratabia — AI sprite generators](https://abratabia.com/ai-game-art/ai-sprite-generators.php) ·
[Sorceress — How to generate game sprites with AI in 2026](https://sorceress.games/blog/how-to-generate-game-sprites-with-ai-in-2026) ·
[SpriteCook — Creating pixel art assets](https://www.spritecook.ai/blog/creating-pixel-art-assets)
