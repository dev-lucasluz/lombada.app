import { useEffect, useRef, type ReactNode } from "react";
import "./Dialog.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Janela modal acessível: o foco entra nela, o Tab não escapa para a página de trás,
 * Esc e clique no fundo fecham, e o foco volta para o botão que a abriu.
 */
export function Dialog({
  titleId,
  onClose,
  children,
  wide = false,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** Janela mais larga, para formulários com dois campos por linha. */
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    if (!el) return;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={wide ? "dialog is-wide" : "dialog"} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
