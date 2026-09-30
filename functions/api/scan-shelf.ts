/**
 * POST /api/scan-shelf
 * Recebe uma foto de estante (base64), confere o login e a cota diária do usuário
 * e pede ao Gemini a lista de lombadas visíveis. A foto não é guardada em lugar nenhum.
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  SCAN_DAILY_LIMIT?: string;
}

type ScanRequest = { image: string; mimeType: string };

export type DetectedSpine = {
  title: string;
  volume: number | null;
  confidence: "alta" | "media" | "baixa";
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const PROMPT = `Você está olhando uma foto de uma estante com mangás e/ou livros físicos.
Liste cada lombada visível, da esquerda para a direita e de cima para baixo.
Para cada uma, informe:
- title: o título da série como aparece na lombada (sem o número do volume)
- volume: o número do volume, se aparecer; senão null
- confidence: "alta" se leu com clareza, "media" se deduziu parte, "baixa" se está difícil de ler
Não invente lombadas que não estão na foto. Se a foto não mostrar lombadas, retorne uma lista vazia.`;

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      volume: { type: "INTEGER", nullable: true },
      confidence: { type: "STRING", enum: ["alta", "media", "baixa"] },
    },
    required: ["title", "volume", "confidence"],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Faça login para usar a leitura por foto." }, 401);

  // 1. Confere a sessão no Supabase
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!userRes.ok) return json({ error: "Sua sessão expirou. Entre de novo." }, 401);

  // 2. Valida a imagem antes de gastar cota
  let body: ScanRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Envio inválido." }, 400);
  }
  if (!body.image || !/^image\/(jpeg|png|webp)$/.test(body.mimeType)) {
    return json({ error: "Envie uma foto em JPG, PNG ou WebP." }, 400);
  }
  if (body.image.length * 0.75 > MAX_IMAGE_BYTES) {
    return json({ error: "A foto é grande demais. Tente uma com menos de 4 MB." }, 413);
  }

  // 3. Consome 1 leitura da cota diária (função no banco, rodando como o usuário)
  const limit = Number(env.SCAN_DAILY_LIMIT ?? 30);
  const quotaRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_scan_quota`, {
    method: "POST",
    headers: {
      Authorization: auth,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ daily_limit: limit }),
  });
  if (!quotaRes.ok) return json({ error: "Não foi possível verificar sua cota. Tente de novo." }, 502);
  if (!(await quotaRes.json())) {
    return json({ error: `Você já usou as ${limit} leituras por foto de hoje. Amanhã a cota renova.` }, 429);
  }

  // 4. Pede ao Gemini a lista de lombadas
  const model = env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: body.mimeType, data: body.image } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );

  if (geminiRes.status === 429) {
    return json({ error: "A leitura por foto atingiu o limite do dia para todos os usuários. Tente amanhã." }, 429);
  }
  if (!geminiRes.ok) {
    console.error("Gemini", geminiRes.status, await geminiRes.text());
    return json({ error: "A leitura da foto falhou. Tente de novo com uma foto mais nítida." }, 502);
  }

  const result = (await geminiRes.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

  let spines: DetectedSpine[];
  try {
    spines = JSON.parse(text);
  } catch {
    return json({ error: "Não foi possível entender a resposta da leitura. Tente de novo." }, 502);
  }

  return json({ spines });
};
