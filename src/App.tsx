import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { isSupabaseConfigured } from "./lib/supabase";
import { AppShell } from "./components/AppShell";
import { LoginPage, ResetPasswordPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { HomePage } from "./pages/HomePage";

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
const QuickAddPage = lazy(() => import("./pages/QuickAddPage").then((m) => ({ default: m.QuickAddPage })));

export function App() {
  const { session, loading, recovering } = useAuth();
  const { pathname } = useLocation();

  // Páginas públicas: abrem sem login (linkadas na tela de login).
  if (pathname === "/privacidade" || pathname === "/termos") {
    return <Suspense fallback={null}>{pathname === "/termos" ? <TermsPage /> : <PrivacyPage />}</Suspense>;
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
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
