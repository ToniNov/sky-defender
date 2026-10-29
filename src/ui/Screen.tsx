import type { ReactNode } from 'react';

/** Карточка по центру поверх игры — основа всех экранов. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="screen">
      <div className="card">{children}</div>
    </div>
  );
}
