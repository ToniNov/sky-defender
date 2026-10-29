# Промпты для Gemini — все 14 моделей

Готовые промпты: копировать блок целиком и вставлять в Gemini. Почему они такие и что делать с результатом — в `docs/art-brief.md`.

- **Новый чат** — промпт собран полностью (описание + стиль + фон).
- **Правка в том же чате** — короткий текст, вставлять в чат, где уже есть нужная картинка.
- **«Приложить образец»** — перед отправкой прикрепить к сообщению указанные готовые картинки (скрепка в поле ввода).

Удачную картинку сохранить в `raw/` под именем из заголовка, вырезать фон (команда в брифе) и положить PNG сюда. В строку «Заметки» записать, какие правки понадобились — пригодится, если модель придётся переделать.

Не устроил результат — не генерировать заново, а дописать правку в тот же чат (готовые фразы — в брифе, раздел «Как писать промпт»).

---

## День 1 — подбор стиля

### 1. Классика — самолёт игрока, базовая модель
Файл: `player-classic.png` · фон: magenta · **новый чат «Игрок»**

```
A small friendly fighter jet with its nose pointing UP. White fuselage with a red stripe,
sky-blue swept wings with red wingtips, a dark blue glass cockpit near the nose,
small twin tail fins, and an orange engine nozzle at the bottom.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure magenta color (#FF00FF), completely uniform, no gradient.
```
Заметки:

### 2. Разведчик — враг, зелёный, маленький
Файл: `enemy-scout.png` · фон: magenta · **новый чат «Враги»**, приложить образец: №1

```
Use the attached image only as a style reference: the same art style, outline weight,
shading and level of detail, but a completely different ship.

A small green alien scout pod facing DOWN. A round body with big curious eyes on the front,
two antennae, tiny side thrusters. Cute but alien, very compact and simple.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure magenta color (#FF00FF), completely uniform, no gradient.
```
Проверить: самый маленький и простой силуэт из всех врагов.
Заметки:

### 3. Щитоносец — враг, золотой, щит снизу по центру
Файл: `enemy-shielder.png` · фон: magenta · **тот же чат «Враги»**

```
Keep the same art style as the previous ship. Now draw a different enemy:

A heavy golden alien tank-ship facing DOWN. A thick armored body with a large bright
energy shield plate covering ONLY the bottom-center front, about 60% of the ship width.
The left and right sides are exposed, with visible weak spots (glowing vents) on each side.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure magenta color (#FF00FF), completely uniform, no gradient.
```
Проверить: щит явно виден по центру снизу, бока открыты — иначе непонятно, почему пули отскакивают.
Заметки:

> После дня 1: вырезать фон, подключить три модели, посмотреть в бою. Продолжать, только если стиль нравится.

---

## День 2 — самолёты игрока

### 4. Закат — перекраска Классики
Файл: `player-sunset.png` · фон: green · **правка в чате «Игрок»** (где готова №1)

```
Keep exactly the same jet: same shape, outline, size and position. Change only the colors:
orange and peach wings, cream fuselage, yellow wingtips, a warm sunset palette.
Change the background to one flat solid pure green color (#00FF00), completely uniform.
```
Заметки:

### 5. Изумруд — перекраска Классики
Файл: `player-emerald.png` · фон: magenta · **правка в чате «Игрок»**, приложить образец: №1

```
Take the attached jet. Keep exactly the same jet: same shape, outline, size and position.
Change only the colors: emerald green wings, mint highlights, gold stripe and gold wingtips.
The background is one flat solid pure magenta color (#FF00FF), completely uniform.
```
Образец прикладывать обязательно: после №4 последней в чате стала оранжевая версия.
Заметки:

### 6. Ночь — перекраска Классики
Файл: `player-night.png` · фон: magenta · **правка в чате «Игрок»**, приложить образец: №1

```
Take the attached jet. Keep exactly the same jet: same shape, outline, size and position.
Change only the colors: matte dark graphite body, thin glowing cyan neon lines on the wings
and stripe, cyan cockpit. Keep the graphite light enough to stand out on a dark navy background.
The background is one flat solid pure magenta color (#FF00FF), completely uniform.
```
Проверить: на тёмно-синем фоне самолёт не теряется.
Заметки:

### 7. Дельта
Файл: `player-delta.png` · фон: green · **новый чат «Игрок 2»**, приложить образец: №1

```
Use the attached image only as a style reference: the same art style, outline weight,
shading and level of detail, but a completely different aircraft.

A sleek delta-wing interceptor with its nose pointing UP. One large triangular crimson wing
with a narrow white fuselage running through it, small canards near the cockpit,
twin angled tail fins. Aggressive but clean.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.
```
Заметки:

### 8. Стелс
Файл: `player-stealth.png` · фон: green · **тот же чат «Игрок 2»**

```
Keep the same art style as the previous aircraft. Now draw a different one:

An angular stealth flying wing with its nose pointing UP. Faceted gray panels with lighter
gray highlights on the facets, a sharp zigzag trailing edge, a small golden cockpit,
thin red edge lights on the wingtips. It must stay readable on a dark navy background.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.
```
Проверить: светлые грани видны — тёмный самолёт на тёмном фоне главный риск.
Заметки:

### 9. Ретро
Файл: `player-biplane.png` · фон: green · **тот же чат «Игрок 2»**

```
Keep the same art style as the previous aircraft. Now draw a different one:

A cute retro biplane with its nose pointing UP. Red double wings with visible struts,
a cream wooden fuselage, an open cockpit with a pilot in goggles,
a solid propeller with two visible blades at the nose, a red tail.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.
```
Пропеллер — сплошной, не размытый: полупрозрачное размытие исчезнет при вырезании фона.
Заметки:

---

## День 3 — враги

### 10. Тарелка — голубая, стреляет
Файл: `enemy-saucer.png` · фон: magenta · **новый чат «Враги 2»**, приложить образцы: №2 и №3

```
Use the attached images only as a style reference: the same art style, outline weight,
shading and level of detail, but a completely different enemy ship.

A classic flying saucer seen from directly above. A cyan metal disc with a glass dome
in the center, a ring of lights around the rim, and a small gun turret on the bottom edge.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure magenta color (#FF00FF), completely uniform, no gradient.
```
Проверить: турель снизу видна — подсказка, что враг стреляет.
Заметки:

### 11. Камикадзе — красно-оранжевый, таранит
Файл: `enemy-kamikaze.png` · фон: green · **тот же чат «Враги 2»**

```
Keep the same art style as the previous ship. Now draw a different enemy:

A red-orange alien dart facing DOWN. A sharp arrowhead shape with a spiked nose pointing down,
swept-back fins, and a bright hot engine at the back (top). Looks fast and dangerous.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.
```
Проверить: нос очевиден — перед тараном камикадзе поворачивается им на игрока.
Заметки:

### 12. Сплиттер — розовый, распадается надвое
Файл: `enemy-splitter.png` · фон: green · **тот же чат «Враги 2»**

```
Keep the same art style as the previous ship. Now draw a different enemy:

A pink alien ship facing DOWN, made of two identical halves joined by a bright seam
straight down the middle. Perfectly symmetrical; the seam clearly shows it can split apart.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.
```
Заметки:

### 13. Осколок — половинка сплиттера
Файл: `enemy-mini.png` · фон: green · **правка в чате «Враги 2»** (сразу после №12)

```
Now draw only the left half of this ship as a separate small ship: same colors and style,
a cracked bright edge where the seam was, centered in the image with empty margin around it.
Keep the background one flat solid pure green color (#00FF00), completely uniform.
```
Заметки:

### 14. Флагман — босс, фиолетовый, самый крупный
Файл: `enemy-mother.png` · фон: green · **новый чат «Босс»**, приложить образцы: №2, №3, №10

```
Use the attached images only as a style reference: the same art style, outline weight
and shading, but a completely different, much bigger and more important enemy ship.

A huge alien mothership facing DOWN. A wide purple saucer-like hull with armored plates
in lighter lavender tones, a magenta core in the center, several gun ports along the front
(bottom) edge. Menacing and impressive, more detailed than a regular enemy but still
built from big readable shapes.

This is a 2D game sprite for a mobile arcade shooter, drawn in a flat vector style
with clean bold shapes and soft cel shading, bright saturated colors.
Show it in a strict top-down orthographic view, like a blueprint plan seen from directly above,
perfectly symmetrical left to right, centered, filling about 70% of a square image
with empty margin on all sides. Crisp hard outline; any glow stays inside the hull.
Nothing else in the image: no text, no letters, no logos, no frame, no shadow, no ground,
no clouds, no stars, no scenery.

The background is one flat solid pure green color (#00FF00), completely uniform, no gradient.
```
Проверить: корпус не чисто чёрный — перед атакой босс подсвечивается цветом атаки, и светлые плиты должны эту подсветку принимать.
Заметки:
