/**
 * POST /api/scan-shelf  { image: base64, mimeType }
 * Lê as lombadas de uma foto de estante. A foto não é guardada em lugar nenhum.
 */
import { authorize, callGemini, precheckRequest, readJsonBody, HttpError, json, toResponse, type AiEnv } from "../../server/ai";

export type DetectedSpine = {
  title: string;
  volume: number | null;
  confidence: "alta" | "media" | "baixa";
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** A foto vai em base64 dentro do JSON: um pouco mais que 4/3 do tamanho. */
const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES * 1.4);

const PROMPT = `Você está olhando uma foto de uma estante com mangás e/ou livros físicos.
Liste cada lombada visível, da esquerda para a direita e de cima para baixo.
Para cada uma, informe:
- title: o título da série como aparece na lombada, sem o número do volume. Se estiver em japonês, use o título em romaji ou o nome pelo qual a série é conhecida no Brasil.
- volume: o número do volume, se aparecer; senão null
- confidence: "alta" se leu com clareza, "media" se deduziu parte, "baixa" se está difícil de ler

Atenção a estes casos, que costumam passar despercebidos:
- Capas à mostra (livros de frente, não só lombadas), seja um livro ou vários espalhados numa cama, mesa ou pilha: devolva UMA entrada para cada livro, com o título principal da capa, e o volume se o número aparecer na capa (ex.: "Vol. 3"); senão null. Não pare no primeiro livro.
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
    precheckRequest(request, MAX_BODY_BYTES);
    const body = await readJsonBody<{ image?: string; mimeType?: string }>(request, MAX_BODY_BYTES);
    if (!body.image || !body.mimeType || !/^image\/(jpeg|png|webp)$/.test(body.mimeType)) {
      throw new HttpError(400, "Envie uma foto em JPG, PNG ou WebP.");
    }
    if (body.image.length * 0.75 > MAX_IMAGE_BYTES) {
      throw new HttpError(413, "A foto é grande demais. Tente uma com menos de 4 MB.");
    }

    const quota = await authorize(request, env);

    const spines = await callGemini<DetectedSpine[]>(
      env,
      [{ inline_data: { mime_type: body.mimeType, data: body.image } }, { text: PROMPT }],
      SCHEMA,
      quota,
    );
    return json({ spines });
  } catch (err) {
    return toResponse(err);
  }
}
