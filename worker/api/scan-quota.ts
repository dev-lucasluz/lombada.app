/**
 * GET /api/scan-quota
 * Devolve quantas leituras por IA a pessoa já usou hoje e qual é o limite diário.
 * Não consome nada da cota.
 */
import { HttpError, dailyLimit, json, toResponse, type AiEnv } from "../../server/ai";

export async function handleScanQuota(request: Request, env: AiEnv): Promise<Response> {
  try {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar.");

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/scan_usage_today`, {
      method: "POST",
      headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status === 401 || res.status === 403) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");
    if (!res.ok) throw new HttpError(502, `Não foi possível consultar a cota (o banco respondeu ${res.status}).`);

    const used = Number(await res.json());
    const limit = dailyLimit(env);
    return json({ used: Number.isFinite(used) ? used : 0, limit });
  } catch (err) {
    return toResponse(err);
  }
}
