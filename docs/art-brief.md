# Небесный патруль: бриф на графику кораблей

Описания моделей для генерации в **бесплатном Gemini** (gemini.google.com, приложение Gemini) — 14 спрайтов: 7 самолётов игрока и 7 врагов.
Сейчас вся графика векторная и рисуется кодом: самолёты игрока — в `src/game/skins.ts`, враги — в `src/game/textures.ts`.
Нарисованные модели заменят их по одной, механика и хитбоксы не меняются.

---

## Ограничения бесплатного Gemini и что с ними делать

Собрано в октябре 2026 по справке Google и обзорам (ссылки внизу). Точной цифры лимита в справке Google нет — «~20 в день» взято из обзора за март 2026; число образцов — из документации API, в приложении может быть меньше. Условия меняются часто — если что-то ведёт себя иначе, верить тому, что видно в приложении.

| Ограничение | Что это значит для нас | Как обходим |
|---|---|---|
| **~20 картинок в день** (модель Nano Banana 2; лимит «плавающий», при нагрузке бывает меньше; общие лимиты обновляются раз в несколько часов) | На 14 спрайтов с 2–4 попытками каждый нужно 40–55 картинок — это 3 дня | План по дням ниже. Перекраски делать правкой готовой картинки, а не новой генерацией |
| **Nano Banana Pro недоступен** (только за подписку) | Чуть хуже с мелкими деталями и точным следованием описанию | Крупные простые формы — они нам и нужны для 48 px. Описание короткое и конкретное |
| **Нет прозрачного фона.** Модель отдаёт картинку без альфа-канала, «transparent background» в промпте рисует шахматку или белый фон | Фон придётся вырезать | Сплошной хромакей-фон **своего цвета для каждого корабля** (не совпадающий с цветами корабля) + вырезание одной командой, см. «Как вырезать фон» |
| **Свечение растекается по фону** | После вырезания вокруг корабля останется цветная кайма | Просить чёткий контур и свечение только внутри корпуса: `glows stay inside the hull, crisp hard outline` |
| **Значок-звёздочка Gemini в углу** у бесплатных картинок + невидимая метка SynthID | Значок лежит на фоне в углу | Корабль строго по центру с полями — значок уходит вместе с фоном при вырезании и обрезке. SynthID в игре не мешает |
| **Размер — около 1024×1024** для квадрата, 2K/4K бесплатно не выбрать; пиксели в промпте («1024x1024») модель не слушает, а иногда рисует их надписью | Для босса 2048 не получить | Не нужно: в игру идёт PNG 256×256. Писать `square image`, без чисел |
| **Ракурс съезжает в 3/4**, добавляются тени, земля, облака, надписи | Хитбокс разойдётся с картинкой | В каждом промпте: вид строго сверху как на чертеже, «ничего больше на картинке», «никакого текста». Если съехало — исправлять правкой в том же чате, а не новой генерацией |
| **Длинный чат «забывает» стиль** | Корабли поплывут по стилю | Одна серия — один чат. Через ~10 картинок начинать новый чат и прикладывать 1–3 лучших готовых корабля образцом (Gemini принимает до ~10 картинок-образцов) |

---

## Порядок работы

**День 1 — подбор стиля (≈12–15 картинок).** Классика, Разведчик, Щитоносец: модель игрока, простой враг и враг, у которого механика видна по внешнему виду. Подобрать стиль, вырезать фон, подключить, посмотреть в бою. Только если в бою выглядит хорошо — продолжать.

**День 2 — самолёты игрока (≈15–18).** Закат, Изумруд, Ночь — правкой Классики в том же чате (форма не меняется, 1–2 попытки каждый). Затем Дельта, Стелс, Ретро — с Классикой приложенной образцом стиля.

**День 3 — враги (≈15–20).** Тарелка, Камикадзе, Сплиттер, затем Осколок (правкой Сплиттера) и Флагман. В новом чате приложить Разведчика и Щитоносца образцом.

Правила:

1. Весь набор — только в Gemini: корабли из разных генераторов будут выглядеть как из разных игр.
2. Сначала одна генерация по промпту, дальше — **правки в том же чате** («make the wings wider», «make it perfectly top-down»). Правка дешевле и точнее новой попытки.
3. Удачный результат сразу скачивать и класть в `src/assets/ships/raw/` (исходник с фоном), промпт и правки — в `src/assets/ships/prompts.md`.
4. Кончился лимит — не переходить в другой сервис, продолжить на следующий день.

---

## Как писать промпт

Gemini лучше понимает связное описание, чем список тегов через запятую. Промпт = **описание корабля** (из разделов ниже) + **общий блок стиля** + **строка фона** (у каждого корабля своя).

**Общий блок стиля** — добавлять в конец каждого промпта (по-английски модель держит стиль стабильнее):

```
This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.
```

**Строка фона** — одна из двух, какая указана у корабля:

- `The background is one flat solid pure magenta color (#FF00FF), completely uniform, no gradient.` — для зелёных, голубых, золотых, белых, серых кораблей.
- `The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.` — для розовых, фиолетовых, красных, оранжевых.

Цвет фона не должен встречаться в самом корабле — иначе вырежется кусок корпуса.

**Если результат не тот — правки в том же чате:**

- съехал ракурс: `Redraw it in a perfectly top-down view from directly above, keep everything else the same.`
- появились тени или фон с градиентом: `Remove the shadow and make the background one flat solid magenta color.`
- слишком мелкие детали: `Simplify it: fewer, bigger shapes, it must read clearly at a very small size.`
- кривая симметрия: `Make it perfectly symmetrical left to right.`

---

## Общие требования

- **Направление.** Игрок — носом **вверх**, враги — носом **вниз** (к игроку). Строго вид сверху: если ракурс съедет, хитбокс разойдётся с картинкой.
- **Центр.** Центр картинки = центр хитбокса. Ничего не должно сильно торчать в одну сторону.
- **Размер.** Gemini отдаёт ~1024×1024, в игру идёт уменьшенный PNG 256×256. На экране самолёт игрока ~60 px, враги 24–52 px, босс ~90 px.
- **Цвет вида.** У каждого врага свой цвет (как сейчас): игрок узнаёт врага по цвету и силуэту за доли секунды. Цвета ниже менять только вместе с кодом (`ENEMY_COLOR` в `World.ts` — им окрашиваются взрывы).
- **Читаемость.** Модель должна узнаваться в размере 48 px на тёмном фоне. Мелкие детали пропадут — лучше крупные формы. Проверка: уменьшить картинку до 48 px и посмотреть на тёмно-синем фоне.

---

## Самолёт игрока — 7 скинов (носом вверх)

### Классика — базовая модель · фон magenta
```
A small friendly fighter jet with its nose pointing UP. White fuselage with a red stripe,
sky-blue swept wings with red wingtips, a dark blue glass cockpit near the nose,
small twin tail fins, and an orange engine nozzle at the bottom.
```

### Закат, Изумруд, Ночь — перекраски Классики
Не генерировать заново: в чате с готовой Классикой (или приложив её) попросить правку. Форма остаётся той же — можно перекрасить и в редакторе.

```
Keep exactly the same jet: same shape, outline, size and position. Change only the colors: ...
```

- **Закат** · фон green: `orange and peach wings, cream fuselage, yellow wingtips, a warm sunset palette`
- **Изумруд** · фон magenta: `emerald green wings, mint highlights, gold stripe and gold wingtips`
- **Ночь** · фон magenta: `matte dark graphite body, thin glowing cyan neon lines on the wings and stripe, cyan cockpit; keep the graphite light enough to stand out on a dark navy background`

### Дельта · фон green
```
A sleek delta-wing interceptor with its nose pointing UP. One large triangular crimson wing
with a narrow white fuselage running through it, small canards near the cockpit,
twin angled tail fins. Aggressive but clean.
```

### Стелс · фон green
```
An angular stealth flying wing with its nose pointing UP. Faceted gray panels with lighter
gray highlights on the facets, a sharp zigzag trailing edge, a small golden cockpit,
thin red edge lights on the wingtips. It must stay readable on a dark navy background.
```
Главный риск — тёмный самолёт на тёмном фоне. Без светлых граней потеряется.

### Ретро · фон green
```
A cute retro biplane with its nose pointing UP. Red double wings with visible struts,
a cream wooden fuselage, an open cockpit with a pilot in goggles,
a propeller blur disc at the nose, a red tail.
```
Пропеллер-размытие полупрозрачное — после вырезания проверить, что он не исчез вместе с фоном. Если исчез — попросить `a solid propeller with two visible blades`.

---

## Враги — 7 моделей (носом вниз)

У врагов внешний вид — часть механики: в пункте «Обязательно» то, без чего игрок не поймёт, как с ними бороться.

### Разведчик — зелёный, маленький, быстрый, 1 попадание · фон magenta
```
A small green alien scout pod facing DOWN. A round body with big curious eyes on the front,
two antennae, tiny side thrusters. Cute but alien, very compact and simple.
```
Обязательно: самый маленький и простой силуэт — это «рядовой» враг.

### Тарелка — голубая, качается и стреляет · фон magenta
```
A classic flying saucer seen from directly above. A cyan metal disc with a glass dome
in the center, a ring of lights around the rim, and a small gun turret on the bottom edge.
```
Обязательно: турель снизу — подсказка, что этот враг стреляет.

### Флагман (босс) — фиолетовый, в 2–3 раза больше остальных · фон green
```
A huge alien mothership facing DOWN. A wide purple saucer-like hull with armored plates
in lighter lavender tones, a magenta core in the center, several gun ports along the front
(bottom) edge. Menacing and impressive, more detailed than a regular enemy but still
built from big readable shapes.
```
Генерировать тем же квадратом, что и остальных: в игре его просто масштабируют крупнее. Перед атакой босс подсвечивается цветом атаки (розовый, жёлтый, бирюзовый) — светлые участки корпуса должны эту подсветку принимать, чисто чёрный корпус её не покажет.

### Камикадзе — красно-оранжевый, зависает, целится и таранит · фон green
```
A red-orange alien dart facing DOWN. A sharp arrowhead shape with a spiked nose pointing down,
swept-back fins, and a bright hot engine at the back (top). Looks fast and dangerous.
```
Обязательно: острый силуэт наконечника стрелы — «сейчас врежусь». Перед тараном он поворачивается носом на игрока, поэтому нос должен быть очевиден.

### Щитоносец — золотой, снизу прикрыт щитом, бить по краям · фон magenta
```
A heavy golden alien tank-ship facing DOWN. A thick armored body with a large bright
energy shield plate covering ONLY the bottom-center front. The left and right sides are exposed,
with visible weak spots (glowing vents) on each side.
```
Обязательно: явный щит по центру снизу и уязвимые бока. Без этого игрок не поймёт, почему пули отскакивают. Ширина щита в игре — 32 px из 52 (`ENEMY.shielder.plateHalf` в `balance.ts`), то есть щит — примерно 60% ширины корабля. Если вышел шире — правка `make the shield plate narrower, about 60% of the ship width`.

### Сплиттер — розовый, при гибели распадается на два осколка · фон green
```
A pink alien ship facing DOWN, made of two identical halves joined by a bright seam
straight down the middle. Perfectly symmetrical; the seam clearly shows it can split apart.
```
Обязательно: шов посередине — подсказка, что он развалится.

### Осколок — половинка сплиттера · фон green
Правкой готового Сплиттера в том же чате:
```
Now draw only the left half of this ship as a separate small ship: same colors and style,
a cracked bright edge where the seam was, centered in the image.
```

---

## Что не генерировать

Пули, искры, монеты, иконки бонусов, пламя двигателя, кольца щита и магнита. Они мелкие (10–30 px), и векторные выглядят чётче уменьшенной картинки. Менять их имеет смысл, только если меняется весь визуальный стиль игры.

---

## Как вырезать фон

Gemini отдаёт картинку с фоном (иногда с лёгким сжатием — края чуть «грязные»), поэтому вырезаем с допуском. Бесплатно и локально — [ImageMagick](https://imagemagick.org) (`brew install imagemagick`):

```bash
# magenta-фон; для green заменить #FF00FF на #00FF00
magick raw/enemy-scout.png -fuzz 18% -transparent "#FF00FF" -trim +repage \
  -resize 256x256 -gravity center -background none -extent 256x256 enemy-scout.png
```

- `-fuzz 18%` — допуск цвета фона: осталась кайма — поднять до 25%, пропали куски корпуса — опустить до 10%.
- `-trim` обрезает пустые поля (вместе со значком Gemini в углу), `-extent` возвращает квадрат с кораблём по центру — центр картинки остаётся центром хитбокса.
- Без терминала: GIMP → «Цвет → Цвет в альфа-канал», выбрать цвет фона.
- После вырезания посмотреть на тёмном фоне при 48 px: нет ли каймы цвета фона по краю.

---

## Как подключить

- PNG класть в `src/assets/ships/` (`player-classic.png`, `enemy-scout.png`…), исходники с фоном — в `src/assets/ships/raw/`, грузить через `Assets.load` — пункт техдолга в `ROADMAP.md`.
- В `skins.ts` / `textures.ts` меняется только источник текстуры. Хитбоксы остаются прежними — баланс не меняется. Если модель заметно больше или меньше хитбокса, подогнать масштаб спрайта, а не хитбокс.
- После подключения — посмотреть в бою: на тёмном фоне, в движении, рядом с пулями и искрами.

**Если Gemini не справляется** (стиль не держится, ракурс не исправляется правками): Recraft отдаёт векторный SVG, а скины уже хранятся как SVG. Сгенерированный SVG надо проверить на парсере Pixi: он понимает `polygon`, `path`, `rect`, `circle`, `ellipse`, `fill`, `fill-opacity`; в `points` у `polygon` — только целые числа (Pixi читает их как `/-?\d+/`). Проверка — тест в `e2e/skins.spec.ts`. Но тогда весь набор переделывать там же — смешивать генераторы нельзя.

---

Источники:
[Справка Gemini: лимиты и тарифы](https://support.google.com/gemini/answer/16275805) ·
[Gemini Image Free Tier в 2026 (лимиты приложения)](https://www.aifreeapi.com/en/posts/gemini-image-free-tier-2026) ·
[Gemini API: генерация картинок (SynthID, образцы)](https://ai.google.dev/gemini-api/docs/image-generation) ·
[Nano Banana 2 — Google DeepMind](https://deepmind.google/models/gemini-image/flash/) ·
[Значок на бесплатных картинках и SynthID](https://www.newsbytesapp.com/news/science/google-drops-nano-banana-pro-ai-image-tool-for-creators/tldr) ·
[Руководство по промптам для Nano Banana](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
