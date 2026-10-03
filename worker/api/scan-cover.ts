/**
 * POST /api/scan-cover  { image: base64, mimeType }
 * Lê a capa de um livro ou mangá e devolve título e autor para a busca.
 * A foto não é guardada em lugar nenhum.
 */
import { authorize, callGemini, precheckRequest, readJsonBody, HttpError, json, toResponse, type AiEnv } from "../../server/ai";

type Cover = { title: string; author: string | null; kind: "manga" | "book"; found: boolean };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** A foto vai em base64 dentro do JSON: um pouco mais que 4/3 do tamanho. */
const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES * 1.4);

const PROMPT = `Você está olhando a foto da capa de um livro ou mangá físico.
Informe:
- found: true se dá para ler o título na capa; false se não há capa legível na foto
- title: o título principal como aparece na capa, sem subtítulo de edição nem selos (ex.: "Edição de colecionador"). Se for mangá em japonês, use o título em romaji ou o nome pelo qual é conhecido no Brasil
- author: o autor, se aparecer; senão null
- kind: "manga" se for mangá (quadrinho japonês), "book" para qualquer outro livro
Não invente: se não conseguir ler, found = false e title vazio.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    title: { type: "STRING" },
    author: { type: "STRING", nullable: true },
    kind: { type: "STRING", enum: ["manga", "book"] },
  },
  required: ["found", "title", "author", "kind"],
};

export async function handleScanCover(request: Request, env: AiEnv): Promise<Response> {
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

    const raw = await callGemini<Cover>(
      env,
      [{ inline_data: { mime_type: body.mimeType, data: body.image } }, { text: PROMPT }],
      SCHEMA,
      quota,
    );
    const title = String(raw.title ?? "").trim().slice(0, 200);
    const author = raw.author ? String(raw.author).trim().slice(0, 120) : null;
    return json({
      found: raw.found === true && title.length > 0,
      title,
      author: author || null,
      kind: raw.kind === "manga" ? "manga" : "book",
    });
  } catch (err) {
    return toResponse(err);
  }
}
