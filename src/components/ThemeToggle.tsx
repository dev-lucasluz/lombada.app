import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Alterna entre claro e escuro. Sem escolha salva, segue o tema do sistema.
 * O index.html aplica o tema salvo antes do primeiro desenho.
 */
export function ThemeToggle({ className = "", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(currentTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Sem armazenamento (aba anônima etc.): o tema vale só nesta visita.
    }
    setTheme(next);
  };

  const label = theme === "dark" ? "Usar tema claro" : "Usar tema escuro";

  return (
    <button type="button" className={className} onClick={toggle} title={label} aria-label={label}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
      {withLabel && <span>{theme === "dark" ? "Claro" : "Escuro"}</span>}
    </button>
  );
}
