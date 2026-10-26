import { Text } from 'pixi.js';
import { BOSS, ENEMY, WAVES } from '../balance';
import { BOSS_ESCORTS, planWave, type FormationName } from '../waves';
import type { Effects } from './Effects';
import type { Enemies } from './Enemies';
import type { Field } from './Field';
import { clamp, difficulty, rand, randIn } from './rules';

const WAVE_TEXT_COLOR = 0xffe066;
const WARN_TEXT_COLOR = 0xff4d6d;
const BOSS_WARN_SHAKE = 3; // сила тряски экрана во время предупреждения

/**
 * Волны: какие построения когда вылетают и где встают враги. Состав волн — в ../waves.ts, темп — в balance.ts.
 * Ещё здесь надписи «ВОЛНА N» и «ВНИМАНИЕ! ФЛАГМАН» — World кладёт их в root поверх слоёв.
 */
export class Waves {
  readonly waveText: Text;
  readonly warnText: Text;
  wave = 0;

  private queue: FormationName[] = []; // построения, которые ещё не вылетели
  private timer = 0; // до следующего построения (или конец ожидания пустого поля)
  private banner = 0; // сколько ещё показывать «ВОЛНА N»
  private bossWarn = 0; // сколько ещё до появления босса
  private field: Field;
  private enemies: Enemies;
  private fx: Effects;
  private onWave: (n: number) => void;

  constructor(field: Field, enemies: Enemies, fx: Effects, onWave: (n: number) => void) {
    this.field = field;
    this.enemies = enemies;
    this.fx = fx;
    this.onWave = onWave;

    this.waveText = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 34,
        fontWeight: '900',
        fill: WAVE_TEXT_COLOR,
        stroke: { color: 0x000000, width: 6 },
      },
    });
    this.waveText.anchor.set(0.5);
    this.waveText.visible = false;

    this.warnText = new Text({
      text: 'ВНИМАНИЕ!\nФЛАГМАН',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 28,
        fontWeight: '900',
        align: 'center',
        fill: WARN_TEXT_COLOR,
        stroke: { color: 0x000000, width: 5 },
      },
    });
    this.warnText.anchor.set(0.5);
    this.warnText.visible = false;
  }

  start(n: number) {
    this.wave = n;
    this.queue = planWave(n);
    this.timer = WAVES.introTime;
    this.banner = WAVES.introTime;
    this.waveText.text = `ВОЛНА ${n}`;
    this.onWave(n);
  }

  /** Построения вылетают по очереди; когда все вылетели и поле опустело — следующая волна. */
  update(dt: number) {
    this.timer -= dt;
    if (this.queue.length) {
      if (this.timer > 0) return;
      this.spawnFormation(this.queue.shift()!);
      this.timer = this.queue.length
        ? Math.max(WAVES.minGap, WAVES.gap - (this.wave - 1) * WAVES.gapDecay) * randIn(WAVES.jitter)
        : WAVES.maxClearWait;
      return;
    }

    const bossOnField = this.enemies.hasBoss();
    if (bossOnField || this.bossWarn > 0) {
      // волна босса кончается только с его смертью, а пока подлетает сопровождение
      if (bossOnField && this.timer <= 0) {
        this.spawnFormation(BOSS_ESCORTS[Math.floor(Math.random() * BOSS_ESCORTS.length)]);
        this.timer = WAVES.bossEscortInterval;
      }
      return;
    }

    if (this.enemies.list.length === 0 || this.timer <= 0) this.start(this.wave + 1);
  }

  /** Надписи: баннер волны и предупреждение о боссе (по истечении — появляется босс). */
  updateBanners(dt: number) {
    this.updateBossWarning(dt);

    if (this.banner <= 0) return;
    const { w, h } = this.field;
    this.banner -= dt;
    const k = this.banner / WAVES.introTime;
    this.waveText.visible = this.banner > 0;
    this.waveText.position.set(w / 2, h * 0.4);
    this.waveText.alpha = Math.min(1, k * 3); // в конце плавно гаснет
    this.waveText.scale.set(1 + Math.max(0, k - 0.85) * 2); // и «выпрыгивает» в начале
  }

  private updateBossWarning(dt: number) {
    if (this.bossWarn <= 0) return;
    if (!this.field.alive) {
      this.cancelBossWarning();
      return;
    }
    const { w, h } = this.field;
    this.bossWarn -= dt;
    if (this.bossWarn <= 0) {
      this.cancelBossWarning();
      this.enemies.spawn('mother', w / 2);
      return;
    }
    this.warnText.visible = true;
    this.warnText.position.set(w / 2, h * 0.3);
    this.warnText.alpha = Math.floor(this.bossWarn * 5) % 2 ? 0.25 : 1;
    this.fx.shakeAtLeast(BOSS_WARN_SHAKE);
  }

  private cancelBossWarning() {
    this.bossWarn = 0;
    this.warnText.visible = false;
  }

  /** Расставить построение над верхним краем экрана. */
  spawnFormation(f: FormationName) {
    const { w, elapsed } = this.field;
    const enemies = this.enemies;
    // разведчики в построении летят с общей скоростью, иначе строй рассыпается сразу
    const scoutVy = randIn(ENEMY.scout.speed) * difficulty(elapsed);
    const scout = (x: number, yOffset = 0) => {
      const e = enemies.spawn('scout', x, yOffset);
      e.vy = scoutVy;
      e.inFormation = true;
      return e;
    };
    switch (f) {
      case 'boss':
        this.bossWarn = BOSS.warnTime;
        break;
      case 'scout':
        enemies.spawn('scout');
        break;
      case 'line':
        for (let i = 0; i < 5; i++) scout((w * (i + 1)) / 6);
        break;
      case 'wedge': {
        const x = rand(90, w - 90);
        scout(x);
        for (const side of [-1, 1]) {
          scout(x + side * 32, 34);
          scout(x + side * 64, 68);
        }
        break;
      }
      case 'snake': {
        // все с одной скоростью и по одной кривой — получается змейка
        const amp = Math.min(ENEMY.scout.snakeAmp, w / 4);
        const x = rand(amp + 20, w - amp - 20);
        for (let i = 0; i < 6; i++) {
          const e = scout(x, i * 44);
          e.baseX = x;
          e.amp = amp;
        }
        break;
      }
      case 'saucers':
        enemies.spawn('saucer', w / 3);
        enemies.spawn('saucer', (2 * w) / 3);
        break;
      case 'splitters':
        enemies.spawn('splitter', w * 0.3);
        enemies.spawn('splitter', w * 0.7, 40);
        break;
      case 'kamikazes':
        for (let i = 0; i < 3; i++) enemies.spawn('kamikaze', (w * (i + 1)) / 4, i * 30);
        break;
      case 'shielderGuard': {
        const x = rand(80, w - 80);
        enemies.spawn('shielder', x);
        scout(clamp(x - 50, 20, w - 20), 30);
        scout(clamp(x + 50, 20, w - 20), 30);
        break;
      }
    }
  }

  clear() {
    this.banner = 0;
    this.waveText.visible = false;
    this.cancelBossWarning();
  }
}
