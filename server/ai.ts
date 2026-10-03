/**
 * Base comum das Pages Functions que usam o Gemini (foto da estante e voz):
 * confere o login no Supabase, consome a cota diária do usuário (devolvida se o Gemini falhar) e chama a API.
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
    // Respostas da API são pessoais (cota, leitura da foto): nada de cache e nada de adivinhar o tipo.
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

/** Leituras por IA por dia. Valor ausente, não numérico ou ≤ 0 volta ao padrão (30): nunca desliga o limite. */
export function dailyLimit(env: Pick<AiEnv, "SCAN_DAILY_LIMIT">) {
  const value = Math.floor(Number(env.SCAN_DAILY_LIMIT));
  return Number.isFinite(value) && value > 0 ? value : 30;
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
 * Antes de ler o corpo: exige login (o cabeçalho, sem consultar nada) e recusa de cara um corpo que já
 * declara tamanho acima do limite. Assim, quem não está logado ou manda um corpo gigante é recusado sem custo.
 */
export function precheckRequest(request: Request, maxBytes: number) {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar.");
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, TOO_BIG);
}

const TOO_BIG = "O envio é grande demais. Tente uma foto menor ou um texto mais curto.";

/** Lê o JSON do corpo com teto de tamanho, valendo também para corpo em pedaços (sem Content-Length). */
export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Envio inválido.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, TOO_BIG);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Envio inválido.");
  }
  // O corpo tem de ser um objeto JSON ({...}); null, lista ou texto solto não servem.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new HttpError(400, "Envio inválido.");
  return parsed as T;
}

/**
 * Confere a sessão e consome 1 leitura da cota diária, de forma atômica (várias requisições ao mesmo tempo
 * não passam do limite). Se o Gemini falhar depois, `callGemini` devolve a leitura (`refundQuota`).
 */
export async function authorize(request: Request, env: AiEnv): Promise<QuotaContext> {
  assertConfigured(env);

  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HttpError(401, "Faça login para continuar.");

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!userRes.ok) throw new HttpError(401, "Sua sessão expirou. Entre de novo.");

  const limit = dailyLimit(env);
  const quotaRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_scan_quota`, {
    method: "POST",
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ daily_limit: limit }),
  });
  if (!quotaRes.ok) {
    console.error("consume_scan_quota", quotaRes.status, await quotaRes.text());
    throw new HttpError(
      502,
      `Não foi possível verificar sua cota (o banco respondeu ${quotaRes.status}). Se persistir, confira se os SQLs do Supabase foram executados.`,
    );
  }
  if (!(await quotaRes.json())) {
    throw new HttpError(429, `Você já usou as ${limit} leituras por IA de hoje. Amanhã a cota renova.`);
  }
  return { auth, env, limit };
}

/**
 * Devolve a leitura quando o Gemini falhou (503, limite do Google, resposta ilegível). O banco limita as
 * devoluções (migração 0017: até 5 por dia por pessoa), então isto não abre brecha para leituras sem limite.
 * Se a migração ainda não rodou, a chamada falha em silêncio e a leitura fica descontada, como antes.
 */
export async function refundQuota({ auth, env }: QuotaContext): Promise<void> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/refund_scan_quota`, {
      method: "POST",
      headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) console.error("refund_scan_quota", res.status);
  } catch (err) {
    console.error("refund_scan_quota", err);
  }
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Chama o Gemini pedindo JSON no formato do schema e devolve o objeto já lido. */
export async function callGemini<T>(env: AiEnv, parts: GeminiPart[], responseSchema: unknown, quota?: QuotaContext): Promise<T> {
  try {
    return await callGeminiOnce<T>(env, parts, responseSchema);
  } catch (err) {
    if (quota) await refundQuota(quota);
    throw err;
  }
}

async function callGeminiOnce<T>(env: AiEnv, parts: GeminiPart[], responseSchema: unknown): Promise<T> {
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
    const detail = await res.text();
    console.error("Gemini", res.status, detail);
    // Diz o que o Gemini respondeu, para o problema ser achado rápido (sem expor chaves)
    const badKey = res.status === 403 || (res.status === 400 && /api[ _]key/i.test(detail));
    const hint = badKey
      ? "A chave GEMINI_API_KEY foi recusada: confira se é a chave do Google AI Studio e se está sem espaços."
      : res.status === 400
        ? "O Gemini não aceitou esta foto ou pedido. Tente outra foto, menor ou mais nítida."
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
