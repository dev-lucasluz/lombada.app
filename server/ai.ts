/**
 * Base comum das Pages Functions que usam o Gemini (foto da estante e voz):
 * confere o login no Supabase, consome a cota diária do usuário e chama a API.
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

/** Confere a sessão e consome 1 uso da cota diária. Devolve o header Authorization. */
export async function authorizeAndConsume(request: Request, env: AiEnv): Promise<string> {
  assertConfigured(env);

  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar.");

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!userRes.ok) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");

  const limit = Number(env.SCAN_DAILY_LIMIT ?? 30);
  const quotaRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_scan_quota`, {
    method: "POST",
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ daily_limit: limit }),
  });
  if (!quotaRes.ok) throw new HttpError(502, "Não foi possível verificar sua cota. Tente de novo.");
  if (!(await quotaRes.json())) {
    throw new HttpError(429, `Você já usou as ${limit} leituras por IA de hoje. Amanhã a cota renova.`);
  }
  return auth;
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Chama o Gemini pedindo JSON no formato do schema e devolve o objeto já lido. */
export async function callGemini<T>(env: AiEnv, parts: GeminiPart[], responseSchema: unknown): Promise<T> {
  const model = env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema },
    }),
  });

  if (res.status === 429) {
    throw new HttpError(429, "A leitura por IA atingiu o limite do dia para todos os usuários. Tente amanhã.");
  }
  if (!res.ok) {
    console.error("Gemini", res.status, await res.text());
    throw new HttpError(502, "A leitura por IA falhou. Tente de novo.");
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
