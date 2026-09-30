import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && publishableKey);

// Com as variáveis vazias o app ainda abre (mostra a tela de configuração),
// então usamos valores fictícios só para não quebrar a criação do client.
export const supabase = createClient(url ?? "http://localhost", publishableKey ?? "anon", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
