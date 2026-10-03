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
