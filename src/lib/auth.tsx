import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthError, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import { demoDb, isDemo } from "./demo";

// Sessão falsa do modo demonstração (só em desenvolvimento; ver demo.ts).
const DEMO_SESSION = { user: { id: "demo", email: "demo@lombada.local", user_metadata: { full_name: "Visitante" } } } as unknown as Session;

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** true quando a pessoa chegou pelo link de "esqueci a senha" e precisa definir uma nova. */
  recovering: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Retorna true se a conta precisa ser confirmada pelo e-mail antes de entrar. */
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  /** Abre a tela de login do Google; ao voltar, a sessão é aberta sozinha. */
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  /** Confere a senha atual (usada antes de trocar a senha). */
  verifyPassword: (password: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** Atualiza o nome de exibição (perfil e metadados da conta). */
  updateName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Traduz os erros do Supabase Auth para mensagens que dizem o que fazer. */
export function authErrorMessage(error: unknown): string {
  const e = error as Partial<AuthError> | undefined;
  switch (e?.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com esse e-mail. Entre ou use “Esqueci a senha”.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 8 caracteres, com letras e números.";
    case "provider_disabled":
      return "O login com Google ainda não está ativado neste servidor. Entre com e-mail e senha.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
    case "same_password":
      return "A nova senha precisa ser diferente da atual.";
    default:
      console.error("Erro de autenticação", error);
      if (/sending|smtp|email/i.test(e?.message ?? "")) {
        return "Não conseguimos enviar o e-mail de confirmação. Confira a configuração de SMTP do Supabase.";
      }
      return `Algo deu errado (${e?.message ?? "sem detalhes"}). Tente de novo em alguns segundos.`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(isDemo ? DEMO_SESSION : null);
  const [loading, setLoading] = useState(isSupabaseConfigured && !isDemo);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || isDemo) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    loading,
    recovering,

    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      // Com confirmação de e-mail ligada, o Supabase cria o usuário mas não abre sessão.
      return data.session === null;
    },

    async signInWithGoogle() {
      if (isDemo) return;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    },

    async sendPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    },

    async resendConfirmation(email) {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
    },

    async updateName(name) {
      if (isDemo) {
        setSession((s) => (s ? ({ ...s, user: { ...s.user, user_metadata: { ...s.user.user_metadata, full_name: name } } } as Session) : s));
        return;
      }
      const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } });
      if (error) throw error;
      const id = data.user?.id;
      if (id) await supabase.from("profiles").update({ display_name: name }).eq("id", id);
      setSession((s) => (s && data.user ? { ...s, user: data.user } : s));
    },

    async verifyPassword(password) {
      const email = session?.user.email;
      if (!email) throw new Error("Sessão sem e-mail.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecovering(false);
    },

    async signOut() {
      if (isDemo) {
        // No modo demonstração, "Sair" restaura os dados de exemplo.
        demoDb.resetAll();
        window.location.assign("/");
        return;
      }
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
