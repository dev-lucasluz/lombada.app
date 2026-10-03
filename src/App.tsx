import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { isSupabaseConfigured } from "./lib/supabase";
import { AppShell } from "./components/AppShell";
import { LoginPage, ResetPasswordPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { HomePage } from "./pages/HomePage";
import { useRouteA11y } from "./lib/useRouteA11y";

// As demais telas só são baixadas quando a pessoa abre cada uma.
const PrivacyPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./pages/LegalPage").then((m) => ({ default: m.TermsPage })));
const CollectionPage = lazy(() => import("./pages/CollectionPage").then((m) => ({ default: m.CollectionPage })));
const EditionPage = lazy(() => import("./pages/EditionPage").then((m) => ({ default: m.EditionPage })));
const ShoppingPage = lazy(() => import("./pages/ShoppingPage").then((m) => ({ default: m.ShoppingPage })));
const AddPage = lazy(() => import("./pages/AddPage").then((m) => ({ default: m.AddPage })));
const ReadingPage = lazy(() => import("./pages/ReadingPage").then((m) => ({ default: m.ReadingPage })));
const RemindersPage = lazy(() => import("./pages/RemindersPage").then((m) => ({ default: m.RemindersPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const SharedShelfPage = lazy(() => import("./pages/SharedShelfPage").then((m) => ({ default: m.SharedShelfPage })));
const QuickAddPage = lazy(() => import("./pages/QuickAddPage").then((m) => ({ default: m.QuickAddPage })));

/** Nome de cada tela na aba do navegador. Telas ausentes (obra, estante compartilhada) usam o próprio título (h1). */
const PAGE_TITLES: Record<string, string> = {
  "/": "Início",
  "/colecao": "Coleção",
  "/compras": "Lista de compras",
  "/adicionar": "Adicionar série",
  "/onde-parei": "Onde parei",
  "/lembretes": "Lembretes",
  "/foto-e-voz": "Foto e voz",
  "/perfil": "Perfil",
  "/admin": "Feedback dos usuários",
  "/privacidade": "Política de privacidade",
  "/termos": "Termos de uso",
};

export function App() {
  const { session, loading, recovering } = useAuth();
  const { pathname } = useLocation();

  const route = pathname.replace(/\/+$/, "") || "/";
  const signedOutPublic = route === "/privacidade" || route === "/termos" || route.startsWith("/estante/");
  const pageTitle = !isSupabaseConfigured
    ? "Configuração"
    : signedOutPublic
      ? PAGE_TITLES[route] ?? null
      : !session
        ? "Entrar"
        : recovering
          ? "Nova senha"
          : PAGE_TITLES[route] ?? null;
  useRouteA11y(route, pageTitle, signedOutPublic || !loading);

  // Páginas públicas: abrem sem login (linkadas na tela de login).
  if (pathname === "/privacidade" || pathname === "/termos") {
    return <Suspense fallback={null}>{pathname === "/termos" ? <TermsPage /> : <PrivacyPage />}</Suspense>;
  }

  // Estante compartilhada por link: abre sem login.
  const shared = pathname.match(/^\/estante\/([^/]+)\/?$/);
  if (shared && isSupabaseConfigured) {
    return <Suspense fallback={null}><SharedShelfPage token={shared[1]} /></Suspense>;
  }

  if (!isSupabaseConfigured) return <SetupPage />;
  if (loading) return null;
  if (!session) return <LoginPage />;
  if (recovering) return <ResetPasswordPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="colecao" element={<CollectionPage />} />
        <Route path="colecao/:id" element={<EditionPage />} />
        <Route path="compras" element={<ShoppingPage />} />
        <Route path="adicionar" element={<AddPage />} />
        <Route path="onde-parei" element={<ReadingPage />} />
        <Route path="lembretes" element={<RemindersPage />} />
        <Route path="foto-e-voz" element={<QuickAddPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
