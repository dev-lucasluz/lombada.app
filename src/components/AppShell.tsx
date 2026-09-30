import { NavLink, Outlet } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useAuth } from "../lib/auth";
import "./AppShell.css";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Coleção", icon: "shelf" },
  { to: "/leitura", label: "Leitura", icon: "book" },
  { to: "/adicionar", label: "Adicionar", icon: "plus" },
  { to: "/lembretes", label: "Lembretes", icon: "bell" },
  { to: "/estante", label: "Foto", icon: "camera" },
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
        <button className="shell-account" onClick={signOut} title="Sair da conta">
          {avatar ? <img src={avatar} alt="" width={32} height={32} /> : <Icon name="out" />}
          <span>Sair</span>
        </button>
      </nav>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
