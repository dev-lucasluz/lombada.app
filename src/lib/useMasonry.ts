import { useLayoutEffect, type RefObject } from "react";

/** Altura de cada linha da grade e espaço entre os nichos (px). Têm de bater com `.series-list` no CSS. */
const ROW = 4;
const GAP = 8;

const spanFor = (height: number) => Math.max(1, Math.ceil((height + GAP) / ROW));

/**
 * Faz cada filho da lista ocupar a altura do seu conteúdo e deixa os seguintes subirem para os espaços
 * que sobram (a grade usa `grid-auto-flow: dense`). Cada filho ocupa `span N` linhas de 4px.
 *
 * Depois, fecha as frestas: um nicho que termina acima do que vem logo embaixo dele (porque o vizinho do
 * lado é mais alto) cresce até encostar, e o conteúdo dele se estica junto (lombadas mais altas).
 *
 * `layoutKey` muda quando entram ou saem itens; mudanças de tamanho são vistas pelo ResizeObserver.
 */
export function useMasonry(ref: RefObject<HTMLElement | null>, layoutKey: string) {
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;

    const apply = () => {
      const children = Array.from(list.children) as HTMLElement[];
      // 1) altura natural de cada nicho
      for (const child of children) child.style.minHeight = "";
      for (const child of children) child.style.gridRowEnd = `span ${spanFor(child.getBoundingClientRect().height)}`;

      // 2) onde cada um ficou
      const boxes = children.map((el) => ({ el, rect: el.getBoundingClientRect() }));

      // 3) cresce até o nicho de baixo (só se houver algum logo abaixo, na mesma faixa horizontal)
      for (const a of boxes) {
        let nextTop = Infinity;
        for (const b of boxes) {
          if (b === a || b.rect.top < a.rect.bottom - 0.5) continue;
          const overlap = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          if (overlap > 1) nextTop = Math.min(nextTop, b.rect.top);
        }
        if (!Number.isFinite(nextTop)) continue;
        const extra = Math.floor((nextTop - (a.rect.bottom + GAP)) / ROW) * ROW;
        if (extra < ROW) continue;
        const height = a.rect.height + extra;
        a.el.style.minHeight = `${height}px`;
        a.el.style.gridRowEnd = `span ${spanFor(height)}`;
      }
    };

    apply();
    // Muda o layout fora do callback do observer (logo depois): mexer nas linhas dentro dele faz o
    // navegador descartar avisos de tamanho dos outros nichos e deixaria alturas velhas.
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(apply, 16);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    Array.from(list.children).forEach((child) => observer.observe(child));
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref, layoutKey]);
}
