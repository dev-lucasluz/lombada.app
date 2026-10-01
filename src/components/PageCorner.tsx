import { ThemeToggle } from "./ThemeToggle";

/**
 * Celular: botão de tema no canto do cabeçalho da página (no PC ele fica na
 * barra lateral). "Sair" e o perfil ficam na página Perfil, pelo dock.
 */
export function PageCorner() {
  return (
    <div className="page-corner">
      <ThemeToggle className="btn btn-ghost btn-square" />
    </div>
  );
}
