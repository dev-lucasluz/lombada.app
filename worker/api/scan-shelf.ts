/**
 * POST /api/scan-shelf  { image: base64, mimeType }
 * Lê as lombadas de uma foto de estante. A foto não é guardada em lugar nenhum.
 */
import { authorizeAndConsume, callGemini, HttpError, json, toResponse, type AiEnv } from "../../server/ai";

export type DetectedSpine = {
  title: string;
  volume: number | null;
  confidence: "alta" | "media" | "baixa";
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const PROMPT = `Você está olhando uma foto de uma estante com mangás e/ou livros físicos.
Liste cada lombada visível, da esquerda para a direita e de cima para baixo.
Para cada uma, informe:
- title: o título da série como aparece na lombada, sem o número do volume. Se estiver em japonês, use o título em romaji ou o nome pelo qual a série é conhecida no Brasil.
- volume: o número do volume, se aparecer; senão null
- confidence: "alta" se leu com clareza, "media" se deduziu parte, "baixa" se está difícil de ler

Atenção a estes casos, que costumam passar despercebidos:
- Livros DEITADOS (na horizontal) em cima de uma fileira, ou empilhados: a lombada fica virada para você, com o texto correndo na horizontal. Leia cada um como uma lombada normal. Ex.: um volume "30" deitado sobre a fileira de uma série.
- Volumes que se destacam dos vizinhos: mais altos, mais baixos ou de outra série. Confira o título de cada um, não assuma que seguem a série ao lado.
- Lombadas parcialmente cobertas por bonecos, objetos ou outros livros: informe se der para ler o título, com confidence "media" ou "baixa".
- Títulos em fonte decorativa ou estilizada: use o contexto (editora, cores, logotipo) para identificar a série.
- Cada volume vale uma entrada, mesmo que o título se repita. Percorra a foto inteira, prateleira por prateleira, sem parar no meio.
Não invente lombadas que não estão na foto. Se a foto não mostrar lombadas, retorne uma lista vazia.`;

const SCHEMA = {
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

export async function handleScanShelf(request: Request, env: AiEnv): Promise<Response> {
  try {
    let body: { image?: string; mimeType?: string };
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Envio inválido.");
    }
    if (!body.image || !body.mimeType || !/^image\/(jpeg|png|webp)$/.test(body.mimeType)) {
      throw new HttpError(400, "Envie uma foto em JPG, PNG ou WebP.");
    }
    if (body.image.length * 0.75 > MAX_IMAGE_BYTES) {
      throw new HttpError(413, "A foto é grande demais. Tente uma com menos de 4 MB.");
    }

    await authorizeAndConsume(request, env);

    const spines = await callGemini<DetectedSpine[]>(
      env,
      [{ inline_data: { mime_type: body.mimeType, data: body.image } }, { text: PROMPT }],
      SCHEMA,
    );
    return json({ spines });
  } catch (err) {
    return toResponse(err);
  }
}
