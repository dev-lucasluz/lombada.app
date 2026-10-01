import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { getMyAvatar } from "./db";

/**
 * Foto da pessoa: a que ela enviou (ou a do Google copiada no cadastro) fica no perfil;
 * se não houver, usa a foto que o Google mandou no login; sem nenhuma, nulo (mostra a inicial).
 */
export function useAvatar(): string | null {
  const { session } = useAuth();
  const meta = session?.user.user_metadata as { avatar_url?: string; picture?: string } | undefined;
  const mine = useQuery({ queryKey: ["profile-avatar"], queryFn: getMyAvatar, staleTime: 5 * 60_000 });
  return mine.data || meta?.avatar_url || meta?.picture || null;
}
