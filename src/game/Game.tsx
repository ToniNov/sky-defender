import { extend, useApplication, useTick } from '@pixi/react';
import { Container, type Ticker } from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { makeTextures } from './textures';
import { World, type WorldEvents } from './World';

extend({ Container });

export type Phase = 'menu' | 'playing' | 'paused' | 'over';

interface Props {
  phase: Phase;
  /** Увеличивается при каждом старте — сигнал начать новую игру. */
  session: number;
  events: WorldEvents;
}

/** Мост между React и игровым миром: создаёт World, кормит его тиками и вводом. */
export function Game({ phase, session, events }: Props) {
  const { app } = useApplication();
  const containerRef = useRef<Container>(null);
  const phaseRef = useRef(phase);
  const eventsRef = useRef(events);

  useEffect(() => {
    phaseRef.current = phase;
    eventsRef.current = events;
  });

  const world = useMemo(() => {
    const ev = () => eventsRef.current;
    return new World(makeTextures(app.renderer), {
      score: (n) => ev().score(n),
      lives: (n) => ev().lives(n),
      weapon: (n) => ev().weapon(n),
      hit: () => ev().hit(),
      kill: (k) => ev().kill(k),
      powerUp: () => ev().powerUp(),
      gameOver: (s) => ev().gameOver(s),
    });
  }, [app]);

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
    if (session > 0) world.reset();
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
