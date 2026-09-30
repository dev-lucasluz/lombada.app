/**
 * POST /api/parse-voice  { text }
 * Transforma uma frase falada ("tenho Naruto do 1 ao 10, falta o 11...")
 * em séries com os volumes que a pessoa tem e os que faltam.
 */
import { authorizeAndConsume, callGemini, HttpError, json, toResponse, type AiEnv } from "../../server/ai";

export type ParsedSeries = { title: string; owned: number[]; missing: number[] };

const MAX_TEXT = 1500;

const PROMPT = `A pessoa está descrevendo, em português falado, os volumes físicos de mangás ou livros que tem.
Extraia cada série mencionada com:
- title: o nome da série, corrigindo erros comuns de reconhecimento de voz (ex.: "one peace" é "One Piece", "naruto chipuden" é "Naruto Shippuden")
- owned: TODOS os números de volume que a pessoa tem, com intervalos expandidos ("do 1 ao 5" vira 1,2,3,4,5)
- missing: os números que a pessoa disse que faltam, também expandidos
Regras:
- "tenho do 12 ao 20" soma 12 a 20 em owned da série falada por último.
- "tenho todos até o 30" significa 1 a 30.
- Números por extenso contam ("um ao dez").
- Ignore volumes acima de 999.
- Não invente séries nem volumes que não foram ditos.
Frase:
`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      owned: { type: "ARRAY", items: { type: "INTEGER" } },
      missing: { type: "ARRAY", items: { type: "INTEGER" } },
    },
    required: ["title", "owned", "missing"],
  },
};

const clean = (list: unknown) =>
  [...new Set((Array.isArray(list) ? list : []).map(Number))]
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 999)
    .sort((a, b) => a - b);

export const onRequestPost: PagesFunction<AiEnv> = async ({ request, env }) => {
  try {
    let body: { text?: string };
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Envio inválido.");
    }
    const text = body.text?.trim() ?? "";
    if (text.length < 3) throw new HttpError(400, "Fale ou digite quais volumes você tem.");
    if (text.length > MAX_TEXT) throw new HttpError(413, "Texto longo demais. Divida em partes menores.");

    await authorizeAndConsume(request, env);

    const raw = await callGemini<ParsedSeries[]>(env, [{ text: PROMPT + text }], SCHEMA);
    const series = raw
      .map((s) => ({ title: String(s.title ?? "").trim(), owned: clean(s.owned), missing: clean(s.missing) }))
      .filter((s) => s.title && (s.owned.length > 0 || s.missing.length > 0));
    return json({ series });
  } catch (err) {
    return toResponse(err);
  }
};
