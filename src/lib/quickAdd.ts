/**
 * Cadastro rápido por foto ou voz: chama as Pages Functions, junta o resultado
 * por série, sugere a série certa (da coleção ou do catálogo) e salva o que a
 * pessoa confirmou na tela de revisão.
 */
import { supabase } from "./supabase";
import { isDemo } from "./demo";
import { parseRanges } from "./ranges";
import { editionLabel } from "./editionLabel";
import { searchBooks, searchManga, type CatalogResult } from "./catalog";
import {
  addToCollection,
  createEdition,
  ensureWork,
  listEditions,
  setVolumesOwned,
  type CollectionItem,
} from "./db";

export type Confidence = "alta" | "media" | "baixa";

/** Uma série detectada, pronta para revisão. */
export type DetectedSeries = {
  key: string;
  title: string;
  owned: number[];
  missing: number[];
  confidence?: Confidence;
};

/** Para onde os volumes vão: uma série da coleção ou uma obra do catálogo. */
export type MatchTarget =
  | { kind: "collection"; collectionId: string; label: string }
  | { kind: "catalog"; result: CatalogResult; label: string };

// ---------------------------------------------------------------------------
// Chamadas às Pages Functions
// ---------------------------------------------------------------------------
async function postAi<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || json === null) {
    // Só quando NÃO há servidor de verdade (rota inexistente ou resposta que não é JSON)
    if (res.status === 404 || json === null) {
      throw new Error("A leitura por IA só funciona com o servidor da Cloudflare (npm run pages:dev ou o site publicado).");
    }
    throw new Error(json?.error ?? "A leitura por IA falhou. Tente de novo.");
  }
  return json as T;
}

type Spine = { title: string; volume: number | null; confidence: Confidence };

export async function scanShelfPhoto(imageBase64: string): Promise<DetectedSeries[]> {
  const { spines } = await postAi<{ spines: Spine[] }>("/api/scan-shelf", {
    image: imageBase64,
    mimeType: "image/jpeg",
  });
  return groupSpines(spines);
}

/** Uso do dia da leitura por IA (foto, voz e capa). Nulo se o servidor não responder. */
export async function getScanQuota(): Promise<{ used: number; limit: number } | null> {
  if (isDemo) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/scan-quota", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
    if (!res.ok) return null;
    const json = (await res.json()) as { used?: number; limit?: number };
    return typeof json.used === "number" && typeof json.limit === "number" ? { used: json.used, limit: json.limit } : null;
  } catch {
    return null;
  }
}

export type CoverRead = { found: boolean; title: string; author: string | null; kind: "manga" | "book" };

/** Lê título e autor da capa de um livro ou mangá (a foto não é guardada). */
export async function scanCoverPhoto(imageBase64: string): Promise<CoverRead> {
  return postAi<CoverRead>("/api/scan-cover", { image: imageBase64, mimeType: "image/jpeg" });
}

/**
 * Só no modo demonstração (sem login não há IA): entende frases simples como
 * "tenho Naruto do 1 ao 10, falta o 11, tenho do 12 ao 20; One Piece do 1 ao 5".
 */
function demoParseVoice(text: string): DetectedSeries[] {
  return text
    .split(/;|\s+e\s+(?=[A-ZÀ-Ú])/)
    .map((part, i) => {
      const clean = part.replace(/\btenho\b/gi, " ");
      const title = clean.split(/\bdo\b|\bfalta\b|\d/i)[0].replace(/[,.]/g, " ").trim();
      const [have, ...missingParts] = clean.split(/\bfaltam?\b/i);
      const rest = missingParts.join(" ");
      const lateHave = rest.split(",").slice(1).join(" ");
      const missing = parseRanges(rest.split(",")[0].replace(/\b(o|os)\b/gi, " "));
      const owned = parseRanges(`${have} ${lateHave}`.replace(/\bdo\b/gi, " ").replace(/\bao\b/gi, "-"));
      return { key: `d${i}`, title, owned, missing };
    })
    .filter((s) => s.title && (s.owned.length || s.missing.length));
}

export async function parseVoiceText(text: string): Promise<DetectedSeries[]> {
  if (isDemo) return demoParseVoice(text);
  const { series } = await postAi<{ series: { title: string; owned: number[]; missing: number[] }[] }>(
    "/api/parse-voice",
    { text },
  );
  return series.map((s, i) => ({ key: `v${i}`, ...s }));
}

/** Reduz a foto para no máximo 2048px no maior lado e converte para JPEG (base64 sem prefixo). */
export async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

// ---------------------------------------------------------------------------
// Agrupamento e sugestão de série
// ---------------------------------------------------------------------------
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, " ")
    .trim();
}

const CONFIDENCE_RANK: Record<Confidence, number> = { baixa: 0, media: 1, alta: 2 };

/** Junta lombadas da mesma série: "Naruto 1", "Naruto 2" → Naruto [1, 2]. */
export function groupSpines(spines: Spine[]): DetectedSeries[] {
  const groups = new Map<string, DetectedSeries>();
  for (const s of spines) {
    const norm = normalizeTitle(s.title);
    if (!norm) continue;
    const g = groups.get(norm) ?? { key: `f${groups.size}`, title: s.title.trim(), owned: [], missing: [], confidence: s.confidence };
    if (s.volume && s.volume > 0 && s.volume <= 999 && !g.owned.includes(s.volume)) g.owned.push(s.volume);
    // A confiança do grupo é a da pior lombada: chama atenção na revisão.
    if (CONFIDENCE_RANK[s.confidence] < CONFIDENCE_RANK[g.confidence ?? "alta"]) g.confidence = s.confidence;
    groups.set(norm, g);
  }
  return [...groups.values()].map((g) => ({ ...g, owned: g.owned.sort((a, b) => a - b) }));
}

/** Procura a série na coleção da pessoa pelo título (contém ou é contido). */
export function findInCollection(title: string, collection: CollectionItem[]): CollectionItem | undefined {
  const t = normalizeTitle(title);
  if (!t) return undefined;
  return (
    collection.find((c) => normalizeTitle(c.edition.work.title) === t) ??
    collection.find((c) => {
      const w = normalizeTitle(c.edition.work.title);
      return w.includes(t) || t.includes(w);
    })
  );
}

export function collectionTarget(c: CollectionItem): MatchTarget {
  return {
    kind: "collection",
    collectionId: c.id,
    label: `${c.edition.work.title} (${[editionLabel(c.edition, c.edition.work.title), "na sua coleção"].filter(Boolean).join(", ")})`,
  };
}

export function catalogTarget(r: CatalogResult): MatchTarget {
  return {
    kind: "catalog",
    result: r,
    label: `${r.title}${r.year ? ` (${r.year})` : ""}, ${r.kind === "book" ? "livro" : "mangá"}, adicionar nova série`,
  };
}

/** O AniList limita requisições por minuto: numa foto com muitas séries, espera e tenta de novo. */
async function searchWithRetry(term: string): Promise<CatalogResult[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await searchManga(term);
    } catch (err) {
      if (attempt >= 3 || !(err as { rateLimited?: boolean }).rateLimited) throw err;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
}

/** Opções de destino: a série da coleção (se houver) e até 5 obras do catálogo. */
export async function suggestTargets(rawTitle: string, collection: CollectionItem[]): Promise<MatchTarget[]> {
  // Tira um "Vol. 12" que tenha vindo colado no título: o número do volume já é lido à parte.
  const title = rawTitle.replace(/[\s,.\-:]*(?:\b(?:vol(?:ume)?|v)\.?|#)\s*\d+\s*$/i, "").trim() || rawTitle;
  const targets: MatchTarget[] = [];
  const own = findInCollection(title, collection);
  if (own) targets.push(collectionTarget(own));
  try {
    let results = await searchWithRetry(title);
    // Apóstrofos e pontuação atrapalham a busca ("Hell's Paradise"): tenta de novo sem eles.
    const plain = title.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (results.length === 0 && plain && plain !== title) results = await searchWithRetry(plain);
    // Livros também aparecem na estante: busca nos dois catálogos e põe primeiro o que tem o nome mais parecido.
    let books: CatalogResult[] = [];
    try {
      books = await searchBooks(title);
    } catch {
      // Sem catálogo de livros agora: segue só com os mangás.
    }
    const wanted = normalizeTitle(title);
    const score = (r: CatalogResult) => {
      const t = normalizeTitle(r.title);
      return t === wanted ? 2 : t.includes(wanted) || wanted.includes(t) ? 1 : 0;
    };
    // O AniList (mangá) vem primeiro quando acha um título tão parecido quanto o melhor livro: "My Hero
    // Academia" é o mangá, não um livro "My Hero Academia, Vol. 12". Livro só passa na frente quando o
    // nome dele é mais parecido (ex.: "Harry Potter", que não existe no AniList).
    const mangaList = results.slice(0, 4);
    const bookList = books.slice(0, 3);
    const best = (list: CatalogResult[]) => Math.max(0, ...list.map(score));
    const ordered = (list: CatalogResult[]) =>
      list.map((r, i) => ({ r, i })).sort((a, b) => score(b.r) - score(a.r) || a.i - b.i).map((x) => x.r);
    const candidates =
      best(mangaList) >= best(bookList) ? [...ordered(mangaList), ...ordered(bookList)] : [...ordered(bookList), ...ordered(mangaList)];
    targets.push(...candidates.map(catalogTarget));
  } catch {
    // Sem catálogo agora: fica só a opção da coleção (ou nenhuma).
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Salvar
// ---------------------------------------------------------------------------
/** Grava os volumes no destino escolhido. Obra nova entra com a primeira edição existente ou uma nova. */
export async function saveToCollection(target: MatchTarget, owned: number[], missing: number[]): Promise<string> {
  let collectionId: string;
  if (target.kind === "collection") {
    collectionId = target.collectionId;
  } else {
    const work = await ensureWork(target.result);
    const editions = await listEditions(work.id);
    const edition =
      editions[0] ??
      (await createEdition({
        work_id: work.id,
        name: work.title,
        publisher: null,
        total_volumes: target.result.volumes,
        is_finished: false,
      }));
    collectionId = await addToCollection(edition.id);
  }
  await setVolumesOwned(collectionId, owned, true);
  await setVolumesOwned(collectionId, missing, false);
  return collectionId;
}

/**
 * Prepara a foto do feedback: redesenha numa imagem nova (isso apaga localização e outros dados
 * escondidos da foto original), reduz para caber e devolve um JPEG em data URL de até ~330 KB.
 */
export async function prepareFeedbackImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem é muito grande (mais de 8 MB).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível abrir essa imagem. Tente um JPG ou PNG.");
  }
  const MAX_CHARS = 440_000;
  for (const maxSide of [1280, 1024, 800]) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // PNG com fundo transparente vira fundo branco
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= MAX_CHARS) return url;
    }
  }
  throw new Error("Não foi possível reduzir a imagem o bastante. Tente outra foto.");
}

/**
 * Prepara a foto de perfil: recorta um quadrado do centro, reduz para 256 px e converte para
 * JPEG (o que também apaga localização e outros dados escondidos da foto original).
 */
export async function prepareAvatar(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem é muito grande (mais de 8 MB).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível abrir essa imagem. Tente um JPG ou PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  if (url.length > 80_000) throw new Error("Não foi possível reduzir a imagem o bastante. Tente outra.");
  return url;
}

/**
 * Prepara a capa enviada pela pessoa: redesenha numa imagem nova (apaga localização e dados escondidos),
 * reduz para no máximo 480 px no maior lado e devolve um JPEG em data URL de até ~70 mil caracteres.
 */
export async function prepareCover(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem é muito grande (mais de 8 MB).");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível abrir essa imagem. Tente um JPG ou PNG.");
  }
  for (const maxSide of [480, 380, 300]) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= 70_000) return url;
    }
  }
  throw new Error("Não foi possível reduzir a imagem o bastante. Tente outra foto.");
}
