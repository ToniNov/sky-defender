import { useState } from 'react';
import {
  SKIN_NAMES,
  SKINS,
  UPGRADE_NAMES,
  UPGRADES,
  upgradeMax,
  type SkinName,
  type UpgradeName,
  type WeaponKind,
} from '../game/balance';
import { skinImage } from '../game/ships';
import type { Progress } from '../progress';
import { CoinIcon } from '../ui/CoinIcon';
import { Screen } from '../ui/Screen';
import { WeaponGrid } from './WeaponGrid';

const UPGRADE_INFO: Record<UpgradeName, { title: string; effect: (level: number) => string }> = {
  fireRate: {
    title: 'Скорострельность',
    effect: (l) => `+${Math.round((1 / (1 - UPGRADES.fireRate.intervalStep * l) - 1) * 100)}% выстрелов`,
  },
  startWeapon: { title: 'Стартовое оружие', effect: (l) => `уровень ${1 + l} с начала боя` },
  extraLife: { title: 'Запасная жизнь', effect: (l) => `+${l} к жизням на старте` },
  magnet: { title: 'Сильный магнит', effect: (l) => `+${l * UPGRADES.magnet.timeStep} с действия` },
};

const SKIN_TITLE: Record<SkinName, string> = {
  classic: 'Классика',
  sunset: 'Закат',
  emerald: 'Изумруд',
  night: 'Ночь',
  delta: 'Дельта',
  stealth: 'Стелс',
  biplane: 'Ретро',
};

export function HangarScreen({
  progress,
  onBuy,
  onPickSkin,
  onPickWeapon,
  onClose,
}: {
  progress: Progress;
  onBuy: (name: UpgradeName) => void;
  onPickSkin: (skin: SkinName) => void;
  onPickWeapon: (kind: WeaponKind) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'upgrades' | 'weapons' | 'skins'>('upgrades');
  return (
    <Screen>
      <h2 className="title small">Ангар</h2>
      <p className="wallet" aria-label={`Монеты: ${progress.coins}`}>
        <CoinIcon />
        {progress.coins}
      </p>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'upgrades'} onClick={() => setTab('upgrades')}>
          Улучшения
        </button>
        <button role="tab" aria-selected={tab === 'weapons'} onClick={() => setTab('weapons')}>
          Оружие
        </button>
        <button role="tab" aria-selected={tab === 'skins'} onClick={() => setTab('skins')}>
          Скины
        </button>
      </div>
      {tab === 'skins' ? (
        <SkinGrid progress={progress} onPick={onPickSkin} />
      ) : tab === 'weapons' ? (
        <WeaponGrid weapons={progress.weapons} coins={progress.coins} onPick={onPickWeapon} />
      ) : (
        <UpgradeList progress={progress} onBuy={onBuy} />
      )}
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    </Screen>
  );
}

function UpgradeList({ progress, onBuy }: { progress: Progress; onBuy: (name: UpgradeName) => void }) {
  return (
    <ul className="upgrades">
      {UPGRADE_NAMES.map((name) => {
        const level = progress.upgrades[name];
        const max = upgradeMax(name);
        const cost = UPGRADES[name].costs[level];
        const info = UPGRADE_INFO[name];
        return (
          <li className="upgrade" key={name}>
            <div className="upgrade-text">
              <span className="upgrade-title">{info.title}</span>
              <span className="upgrade-effect">{level > 0 ? info.effect(level) : 'не куплено'}</span>
              <span className="upgrade-pips" aria-label={`Уровень ${level} из ${max}`}>
                {Array.from({ length: max }, (_, i) => (
                  <i key={i} className={i < level ? 'on' : ''} />
                ))}
              </span>
            </div>
            {cost === undefined ? (
              <span className="upgrade-max">Макс.</span>
            ) : (
              <button
                className="btn buy"
                disabled={cost > progress.coins}
                onClick={() => onBuy(name)}
                aria-label={`Купить: ${info.title} за ${cost}`}
              >
                <CoinIcon />
                {cost}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SkinGrid({ progress, onPick }: { progress: Progress; onPick: (skin: SkinName) => void }) {
  const { owned, selected } = progress.skins;
  return (
    <ul className="skins">
      {SKIN_NAMES.map((skin) => {
        const title = SKIN_TITLE[skin];
        const cost = SKINS[skin].cost;
        const has = owned.includes(skin);
        return (
          <li key={skin} className={`skin${skin === selected ? ' selected' : ''}`}>
            <img src={skinImage(skin)} width={48} height={48} alt="" className={has ? '' : 'locked'} />
            <span className="skin-title">{title}</span>
            {skin === selected ? (
              <span className="skin-state">Выбран</span>
            ) : has ? (
              <button className="btn buy" onClick={() => onPick(skin)} aria-label={`Выбрать скин: ${title}`}>
                Выбрать
              </button>
            ) : (
              <button
                className="btn buy"
                disabled={cost > progress.coins}
                onClick={() => onPick(skin)}
                aria-label={`Купить скин: ${title} за ${cost}`}
              >
                <CoinIcon />
                {cost}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
