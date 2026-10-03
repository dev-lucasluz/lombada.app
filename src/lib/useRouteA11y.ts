import { useEffect, useRef } from "react";

/**
 * Num app de página única o navegador não troca o título da aba nem leva o foco para o conteúdo novo ao mudar de
 * rota: leitor de tela e teclado ficam "parados" na tela anterior (WCAG 2.4.2 e 2.4.3). Aqui o título vira
 * "Página · Lombada" e, ao trocar de rota, o foco vai para o título (h1) da tela nova.
 *
 * `title`: nome da página, ou `null` quando ele só se sabe depois de carregar (usa o texto do h1, como o nome da obra).
 * `enabled`: false enquanto o app ainda decide o que mostrar (carregando a sessão).
 */
export function useRouteA11y(routeKey: string, title: string | null, enabled: boolean) {
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const key = `${routeKey}|${title}`;
    // Na primeira abertura o foco fica onde o navegador o pôs; só as trocas seguintes movem o foco.
    const moveFocus = previous.current !== null && previous.current !== key;
    previous.current = key;

    document.title = title ? `${title} · Lombada` : "Lombada";
    let focused = false;

    const apply = () => {
      const heading = document.querySelector("h1");
      if (!heading) return false;
      if (!title && heading.textContent?.trim()) document.title = `${heading.textContent.trim()} · Lombada`;
      if (moveFocus && !focused) {
        focused = true;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      return true;
    };

    if (apply()) return;
    // As telas são baixadas e preenchidas depois: espera o título aparecer (até 5 s).
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [routeKey, title, enabled]);
}
