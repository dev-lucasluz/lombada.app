import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { between } from "../lib/ranges";
import { volumeColor } from "../lib/spineColor";
import "./Shelf.css";

type ShelfProps = {
  total: number;
  owned: Set<number>;
  /** Tom de partida da série (cada volume gira a partir dele; ver spineColor.ts). */
  hue: number;
};

/** Séries acima deste número de volumes ocupam duas colunas da estante. */
export const LONG_SERIES = 40;

export function isLongSeries(total: number) {
  return total > LONG_SERIES;
}

/** Séries curtas (2 a 4 volumes, ex.: Ping Pong) ocupam meio nicho. */
export function isSmallSeries(total: number) {
  return total >= 2 && total <= 4;
}

/** Quantas meias-colunas a série ocupa na estante: curta 1, normal 2, longa 4. */
export function seriesUnits(total: number) {
  return isSmallSeries(total) ? 1 : isLongSeries(total) ? 4 : 2;
}

/** Classe do nicho conforme o tamanho da série. */
export function nicheClass(total: number) {
  return isSmallSeries(total) ? "is-small" : isLongSeries(total) ? "is-wide" : undefined;
}

/** Largura mínima de cada lombada na faixa (px, já contando o espaço entre elas). */
const MIN_SPINE = 13;
/** Largura mínima por lombada quando há vãos numerados (px, com o espaço entre elas) e menor largura que ainda mostra o número. */
const MIN_SPINE_NUMBERED = 22;
const MIN_NUMBERED_SLOT = 20;

/**
 * Versão compacta da prateleira, para listas. Mede a própria largura e escolhe
 * quantas prateleiras usar para que as lombadas preencham o espaço sem ficarem
 * finas demais: 110 volumes num bloco estreito viram 3 prateleiras; num bloco
 * largo, 1 ou 2.
 */
export function SpineStrip({ total, owned, hue, numberGaps = false }: ShelfProps & { numberGaps?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Medida inicial síncrona; o observer cuida das mudanças de tamanho depois.
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = Math.max(total, 1);
  // Com os vãos numerados, cada lombada precisa de mais espaço para o número caber dentro do vão.
  const minSpine = numberGaps && owned.size < total ? MIN_SPINE_NUMBERED : MIN_SPINE;
  const perShelf = width > 0 ? Math.max(8, Math.floor(width / minSpine)) : count;
  const shelves = Math.ceil(count / perShelf);
  const cols = Math.ceil(count / shelves);
  // Só numera o vão se a lombada tem largura para o número (senão os dígitos quebram).
  const showNumbers = numberGaps && width > 0 && width / cols >= MIN_NUMBERED_SLOT;

  return (
    <div
      ref={ref}
      className={shelves > 1 ? "strip-stack is-multi" : "strip-stack"}
      style={{ "--cols": cols } as CSSProperties}
      aria-hidden="true"
    >
      {Array.from({ length: shelves }, (_, sh) => (
        <div key={sh} className="strip">
          {Array.from({ length: Math.min(cols, count - sh * cols) }, (_, i) => {
            const n = sh * cols + i + 1;
            return owned.has(n) ? (
              <span key={n} className="strip-spine is-owned" style={{ "--spine": volumeColor(hue, n) } as CSSProperties} />
            ) : (
              <span key={n} className={showNumbers ? "strip-spine is-gap" : "strip-spine"} data-digits={String(n).length}>
                {showNumbers ? n : null}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type VolumeGridProps = ShelfProps & {
  /** Marca (true) ou desmarca (false) um conjunto de volumes. */
  onChange: (volumes: number[], owned: boolean) => void;
  disabled?: boolean;
};

/**
 * Prateleira completa. Clique alterna um volume; Shift+clique aplica
 * o mesmo estado a todo o intervalo desde o último volume clicado.
 */
export function VolumeGrid({ total, owned, hue, onChange, disabled }: VolumeGridProps) {
  const lastClicked = useRef<number | null>(null);

  const handleClick = (n: number, shift: boolean) => {
    const nextOwned = !owned.has(n);
    if (shift && lastClicked.current !== null) {
      onChange(between(lastClicked.current, n), nextOwned);
    } else {
      onChange([n], nextOwned);
    }
    lastClicked.current = n;
  };

  return (
    <div className="shelf" role="group" aria-label="Volumes">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const has = owned.has(n);
        return (
          <button
            key={n}
            type="button"
            className={has ? "spine is-owned" : "spine"}
            style={has ? ({ "--spine": volumeColor(hue, n) } as CSSProperties) : undefined}
            aria-pressed={has}
            aria-label={`Volume ${n}${has ? ", tenho" : ", falta"}`}
            disabled={disabled}
            onClick={(e) => handleClick(n, e.shiftKey)}
          >
            <span className="num">{n}</span>
          </button>
        );
      })}
    </div>
  );
}
