import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useAuth } from "../lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import { isDemo } from "../lib/demo";
import { QuickAddJobProvider } from "../lib/quickAddJob";
import { useAvatar } from "../lib/useAvatar";
import { Skeleton } from "./Skeleton";
import { FeedbackNotice } from "./FeedbackNotice";
import { FeedbackButton } from "./FeedbackButton";
import "./AppShell.css";

/** `only`: mostra o item só no PC (`desktop`) ou só no celular (`mobile`). */
const NAV: { to: string; label: string; icon: IconName; only?: "desktop" | "mobile" }[] = [
  { to: "/", label: "Início", icon: "home" },
  { to: "/colecao", label: "Coleção", icon: "shelf" },
  { to: "/onde-parei", label: "Onde parei", icon: "book" },
  { to: "/lembretes", label: "Lembretes", icon: "bell" },
  { to: "/foto-e-voz", label: "Foto e voz", icon: "camera", only: "desktop" },
  { to: "/perfil", label: "Perfil", icon: "user", only: "mobile" },
];

export function AppShell() {
  const { signOut } = useAuth();
  const avatar = useAvatar();

  return (
    <QuickAddJobProvider>
    <div className="shell">
      <nav className="shell-nav" aria-label="Navegação principal">
        <Link to="/" className="shell-brand" title="Voltar para o início" aria-label="Lombada, voltar para o início">
          <img src="/favicon.svg" alt="" width={40} height={40} />
        </Link>
        <ul>
          {NAV.map((item) => (
            <li key={item.to} className={item.only ? `nav-${item.only}-only` : undefined}>
              <NavLink to={item.to} end={item.to === "/"} className="shell-link">
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="shell-tools">
          <NavLink to="/perfil" className="shell-tool shell-profile" title="Meu perfil">
            {avatar ? <img src={avatar} alt="" width={28} height={28} referrerPolicy="no-referrer" style={{ borderRadius: "50%", objectFit: "cover" }} /> : <Icon name="user" />}
            <span>Perfil</span>
          </NavLink>
          <ThemeToggle className="shell-tool" withLabel />
          <button className="shell-tool" onClick={signOut} title="Sair da conta">
            <Icon name="out" />
            <span>Sair</span>
          </button>
        </div>
      </nav>
      <main className="shell-main">
        {isDemo && (
          <p className="demo-bar" role="status">
            Modo demonstração: dados de exemplo só neste navegador, nada vai para o Supabase. “Sair” restaura os dados.
          </p>
        )}
        <Suspense fallback={<div className="page"><Skeleton /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <FeedbackNotice />
      <FeedbackButton />
    </div>
    </QuickAddJobProvider>
  );
}
