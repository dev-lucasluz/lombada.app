import { useRef, type CSSProperties } from "react";
import { between } from "../lib/ranges";
import "./Shelf.css";

type ShelfProps = {
  total: number;
  owned: Set<number>;
  color: string;
};

/** Versão compacta da prateleira, para listas: lombadas finas, sem interação. */
export function SpineStrip({ total, owned, color }: ShelfProps) {
  const count = Math.max(total, 1);
  return (
    <div className={count > 40 ? "strip is-dense" : "strip"} style={{ "--spine": color } as CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={owned.has(i + 1) ? "strip-spine is-owned" : "strip-spine"} />
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
export function VolumeGrid({ total, owned, color, onChange, disabled }: VolumeGridProps) {
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
    <div className="shelf" style={{ "--spine": color } as CSSProperties} role="group" aria-label="Volumes">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const has = owned.has(n);
        return (
          <button
            key={n}
            type="button"
            className={has ? "spine is-owned" : "spine"}
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
