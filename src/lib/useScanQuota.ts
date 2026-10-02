import { useQuery } from "@tanstack/react-query";
import { getScanQuota } from "./quickAdd";

/** Quantas leituras por IA (foto, voz e capa) a pessoa ainda tem hoje. `null` enquanto não se sabe. */
export function useScanQuota(): { left: number | null; limit: number | null } {
  const q = useQuery({ queryKey: ["scan-quota"], queryFn: getScanQuota, staleTime: 30_000, retry: false });
  if (!q.data) return { left: null, limit: null };
  return { left: Math.max(0, q.data.limit - q.data.used), limit: q.data.limit };
}

/** Frase curta para mostrar perto dos botões de leitura por IA; vazia se a cota não é conhecida. */
export function quotaText(left: number | null, limit: number | null): string | null {
  if (left === null || limit === null) return null;
  if (left === 0) return `Você usou as ${limit} leituras por IA de hoje. Amanhã a cota renova.`;
  return `Você ainda tem ${left} ${left === 1 ? "leitura" : "leituras"} por IA hoje (de ${limit}).`;
}
