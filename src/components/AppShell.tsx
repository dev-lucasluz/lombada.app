import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import "./AppShell.css";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Início", icon: "home" },
  { to: "/colecao", label: "Coleção", icon: "shelf" },
  { to: "/onde-parei", label: "Onde parei", icon: "book" },
  { to: "/lembretes", label: "Lembretes", icon: "bell" },
  { to: "/foto-e-voz", label: "Foto e voz", icon: "camera" },
];

export function AppShell() {
  const { signOut, session } = useAuth();
  const avatar = session?.user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Navegação principal">
        <span className="shell-brand" aria-hidden="true">
          <img src="/favicon.svg" alt="" width={36} height={36} />
        </span>
        <ul>
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === "/"} className="shell-link">
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="shell-tools">
          <ThemeToggle className="shell-tool" withLabel />
          <button className="shell-tool" onClick={signOut} title="Sair da conta">
            {avatar ? <img src={avatar} alt="" width={28} height={28} /> : <Icon name="out" />}
            <span>Sair</span>
          </button>
        </div>
      </nav>
      <main className="shell-main">
        <Suspense fallback={<div className="page"><p className="muted">Carregando…</p></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
