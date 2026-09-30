/**
 * Cadastro rápido por foto ou voz: chama as Pages Functions, junta o resultado
 * por série, sugere a série certa (da coleção ou do catálogo) e salva o que a
 * pessoa confirmou na tela de revisão.
 */
import { supabase } from "./supabase";
import { searchManga, type CatalogResult } from "./catalog";
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
    if (res.status === 404 || res.status === 502 || json === null) {
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

export async function parseVoiceText(text: string): Promise<DetectedSeries[]> {
  const { series } = await postAi<{ series: { title: string; owned: number[]; missing: number[] }[] }>(
    "/api/parse-voice",
    { text },
  );
  return series.map((s, i) => ({ key: `v${i}`, ...s }));
}

/** Reduz a foto para no máximo 1600px no maior lado e converte para JPEG (base64 sem prefixo). */
export async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
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
    label: `${c.edition.work.title} (${c.edition.name}, na sua coleção)`,
  };
}

export function catalogTarget(r: CatalogResult): MatchTarget {
  return {
    kind: "catalog",
    result: r,
    label: `${r.title}${r.year ? ` (${r.year})` : ""}, adicionar nova série`,
  };
}

/** Opções de destino: a série da coleção (se houver) e até 5 obras do catálogo. */
export async function suggestTargets(title: string, collection: CollectionItem[]): Promise<MatchTarget[]> {
  const targets: MatchTarget[] = [];
  const own = findInCollection(title, collection);
  if (own) targets.push(collectionTarget(own));
  try {
    const results = await searchManga(title);
    targets.push(...results.slice(0, 5).map(catalogTarget));
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
