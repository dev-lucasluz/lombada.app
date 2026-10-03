/**
 * Base comum das Pages Functions que usam o Gemini (foto da estante e voz):
 * confere o login no Supabase e a cota diária do usuário, chama a API e só então desconta a leitura.
 */

export interface AiEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  SCAN_DAILY_LIMIT?: string;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Erro que já sabe virar resposta HTTP com mensagem para o usuário. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function toResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: "Algo deu errado no servidor. Tente de novo." }, 500);
}

function assertConfigured(env: AiEnv) {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, "A leitura por IA ainda não foi configurada neste servidor (falta a GEMINI_API_KEY).");
  }
}

export type QuotaContext = { auth: string; env: AiEnv; limit: number };

/**
 * Confere a sessão e se ainda há cota hoje, mas NÃO consome nada: a leitura só é descontada depois
 * que o Gemini responde (`consumeQuota`). Se ele falhar (503, 429, resposta ilegível), a pessoa não perde a leitura.
 */
export async function authorize(request: Request, env: AiEnv): Promise<QuotaContext> {
  assertConfigured(env);

  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar.");

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!userRes.ok) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");

  const limit = Number(env.SCAN_DAILY_LIMIT ?? 30);
  const usedRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/scan_usage_today`, {
    method: "POST",
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!usedRes.ok) {
    console.error("scan_usage_today", usedRes.status, await usedRes.text());
    throw new HttpError(
      502,
      `Não foi possível verificar sua cota (o banco respondeu ${usedRes.status}). Se persistir, confira se os SQLs do Supabase foram executados.`,
    );
  }
  if (Number(await usedRes.json()) >= limit) {
    throw new HttpError(429, `Você já usou as ${limit} leituras por IA de hoje. Amanhã a cota renova.`);
  }
  return { auth, env, limit };
}

/** Desconta 1 leitura da cota. Chamada só depois de uma resposta boa do Gemini; falha aqui não derruba a resposta. */
export async function consumeQuota({ auth, env, limit }: QuotaContext): Promise<void> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_scan_quota`, {
      method: "POST",
      headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ daily_limit: limit }),
    });
    if (!res.ok) console.error("consume_scan_quota", res.status, await res.text());
  } catch (err) {
    console.error("consume_scan_quota", err);
  }
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Chama o Gemini pedindo JSON no formato do schema e devolve o objeto já lido. */
export async function callGemini<T>(env: AiEnv, parts: GeminiPart[], responseSchema: unknown): Promise<T> {
  const model = env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const call = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema, mediaResolution: "MEDIA_RESOLUTION_HIGH" },
      }),
    });
  let res = await call();
  // "Sobrecarregado" (503) costuma passar em segundos: uma segunda tentativa antes de mostrar o erro.
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await call();
  }

  if (res.status === 429) {
    throw new HttpError(429, "A leitura por IA atingiu o limite do dia para todos os usuários. Tente amanhã.");
  }
  if (!res.ok) {
    console.error("Gemini", res.status, await res.text());
    // Diz o que o Gemini respondeu, para o problema ser achado rápido (sem expor chaves)
    const hint =
      res.status === 400 || res.status === 403
        ? "A chave GEMINI_API_KEY foi recusada: confira se é a chave do Google AI Studio e se está sem espaços."
        : res.status === 404
          ? "O modelo não existe: confira GEMINI_MODEL."
          : res.status === 503
            ? "O Gemini está sobrecarregado agora."
            : "Tente de novo em alguns minutos.";
    throw new HttpError(502, `A leitura por IA falhou (o Gemini respondeu ${res.status}). ${hint}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  // Modelos com raciocínio podem mandar partes de "pensamento" antes da resposta.
  const answer = body.candidates?.[0]?.content?.parts ?? [];
  const text = answer.filter((p) => p.text && !p.thought).pop()?.text ?? "[]";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(502, "Não foi possível entender a resposta da IA. Tente de novo.");
  }
}
