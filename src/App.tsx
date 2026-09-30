import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PrivacyPage, TermsPage } from "./pages/LegalPage";
import { useAuth } from "./lib/auth";
import { isSupabaseConfigured } from "./lib/supabase";
import { AppShell } from "./components/AppShell";
import { LoginPage, ResetPasswordPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { CollectionPage } from "./pages/CollectionPage";
import { EditionPage } from "./pages/EditionPage";
import { ShoppingPage } from "./pages/ShoppingPage";
import { AddPage } from "./pages/AddPage";
import { ReadingPage } from "./pages/ReadingPage";
import { RemindersPage } from "./pages/RemindersPage";
import { ScanPage } from "./pages/ScanPage";

export function App() {
  const { session, loading, recovering } = useAuth();
  const { pathname } = useLocation();

  // Páginas públicas: abrem sem login (linkadas na tela de login).
  if (pathname === "/privacidade") return <PrivacyPage />;
  if (pathname === "/termos") return <TermsPage />;

  if (!isSupabaseConfigured) return <SetupPage />;
  if (loading) return null;
  if (!session) return <LoginPage />;
  if (recovering) return <ResetPasswordPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CollectionPage />} />
        <Route path="colecao/:id" element={<EditionPage />} />
        <Route path="compras" element={<ShoppingPage />} />
        <Route path="adicionar" element={<AddPage />} />
        <Route path="leitura" element={<ReadingPage />} />
        <Route path="lembretes" element={<RemindersPage />} />
        <Route path="estante" element={<ScanPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
