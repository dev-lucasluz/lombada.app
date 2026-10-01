import { useEffect, useState } from "react";

/**
 * Quantas colunas uma grade tem na largura atual. Recebe pares
 * [largura mínima, colunas] do maior para o menor, espelhando o CSS.
 */
export function useColumns(breakpoints: [minWidth: number, cols: number][], fallback = 1) {
  const get = () => breakpoints.find(([w]) => window.matchMedia(`(min-width: ${w}px)`).matches)?.[1] ?? fallback;
  const [cols, setCols] = useState(get);
  useEffect(() => {
    const onResize = () => setCols(get());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return cols;
}

/**
 * Meias-colunas que sobram vazias na última linha. Cada coluna da estante vale
 * duas meias-colunas; `units` é a soma do espaço de cada série (ver seriesUnits).
 * Com a grade de uma coluna, séries longas ocupam só a linha (2 meias-colunas).
 */
export function emptyUnitsFor(units: number[], cols: number) {
  const perRow = cols * 2;
  const used = units.reduce((sum, u) => sum + Math.min(u, perRow), 0);
  return (perRow - (used % perRow)) % perRow;
}
