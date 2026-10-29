import { extend, useApplication, useTick } from '@pixi/react';
import { Container, type Ticker } from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadShipTextures, type ShipTextures } from './ships';
import { makeTextures } from './textures';
import { World, type Loadout, type WorldEvents } from './World';

extend({ Container });

export type Phase = 'menu' | 'playing' | 'paused' | 'over';

interface Props {
  phase: Phase;
  /** Увеличивается при каждом старте — сигнал начать новую игру. */
  session: number;
  events: WorldEvents;
  /** Улучшения и скин из ангара — применяются при старте партии. */
  loadout: Loadout;
}

/**
 * В dev-режиме StrictMode создаёт Pixi-приложение дважды, и первое уничтожается
 * без рендерера — сцену строим только для живого приложения.
 * Сначала ждём картинки кораблей: без них мир построится на векторных.
 */
export function Game(props: Props) {
  const { app } = useApplication();
  const [ships, setShips] = useState<ShipTextures | null>(null);
  useEffect(() => {
    loadShipTextures().then(setShips, () => setShips({}));
  }, []);
  return app.renderer && ships ? <GameScene {...props} ships={ships} /> : null;
}

/** Мост между React и игровым миром: создаёт World, кормит его тиками и вводом. */
function GameScene({ phase, session, events, loadout, ships }: Props & { ships: ShipTextures }) {
  const { app } = useApplication();
  const containerRef = useRef<Container>(null);
  const phaseRef = useRef(phase);
  const eventsRef = useRef(events);
  const loadoutRef = useRef(loadout);

  useEffect(() => {
    phaseRef.current = phase;
    eventsRef.current = events;
    loadoutRef.current = loadout;
  });

  const world = useMemo(() => {
    const ev = () => eventsRef.current;
    return new World(makeTextures(app.renderer, ships), {
      score: (n) => ev().score(n),
      lives: (n) => ev().lives(n),
      weapon: (w) => ev().weapon(w),
      combo: (m) => ev().combo(m),
      hit: () => ev().hit(),
      kill: (k, by) => ev().kill(k, by),
      powerUp: () => ev().powerUp(),
      coins: (n) => ev().coins(n),
      wave: (n) => ev().wave(n),
      bossDown: (f) => ev().bossDown(f),
      gameOver: (s, d) => ev().gameOver(s, d),
    });
  }, [app, ships]);

  // В dev-сборке мир доступен e2e-тестам как window.__world (см. debug.ts)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__world = world.debugApi();
    return () => {
      delete window.__world;
    };
  }, [world]);

  // Подключаем мир к сцене и следим за размером экрана
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addChild(world.root);
    const onResize = () => world.resize(app.screen.width, app.screen.height);
    onResize();
    app.renderer.on('resize', onResize);
    return () => {
      app.renderer.off('resize', onResize);
      container.removeChild(world.root);
    };
  }, [app, world]);

  useEffect(() => {
    if (session > 0) world.reset(loadoutRef.current);
  }, [session, world]);

  useEffect(() => {
    if (phase === 'menu') world.clear();
  }, [phase, world]);

  // Ввод: перетаскивание пальцем/мышью + клавиатура
  useEffect(() => {
    const canvas = app.canvas as HTMLCanvasElement;
    let pointer: number | null = null;
    let lx = 0;
    let ly = 0;

    const down = (e: PointerEvent) => {
      if (phaseRef.current !== 'playing') return;
      pointer = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer || phaseRef.current !== 'playing') return;
      world.dragBy(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointer) pointer = null;
    };
    const keyDown = (e: KeyboardEvent) => world.keys.add(e.code);
    const keyUp = (e: KeyboardEvent) => world.keys.delete(e.code);
    const blur = () => world.keys.clear();

    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [app, world]);

  const tick = useCallback(
    (ticker: Ticker) => {
      const p = phaseRef.current;
      world.update(ticker.deltaMS, p === 'playing' ? 'run' : p === 'paused' ? 'frozen' : 'idle');
    },
    [world],
  );
  useTick(tick);

  return <pixiContainer ref={containerRef} />;
}
