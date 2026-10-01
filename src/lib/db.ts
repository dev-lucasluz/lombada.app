import { supabase } from "./supabase";
import type { CatalogResult } from "./catalog";
import { demoDb, isDemo } from "./demo";

// ---------------------------------------------------------------------------
// Tipos (espelham supabase/migrations/0001_schema.sql)
// ---------------------------------------------------------------------------
export type WorkKind = "manga" | "book";

export type Work = {
  id: string;
  kind: WorkKind;
  title: string;
  original_title: string | null;
  authors: string[];
  cover_url: string | null;
  /** Cor predominante da capa (#rrggbb); nula para obras sem essa informação. */
  cover_color?: string | null;
  original_volumes: number | null;
  anilist_id: number | null;
  google_books_id: string | null;
  open_library_id?: string | null;
  /** Conteúdo +18 (migração 0005). */
  is_adult?: boolean;
};

export type Edition = {
  id: string;
  work_id: string;
  name: string;
  publisher: string | null;
  total_volumes: number | null;
  is_finished: boolean;
};

export type CollectionItem = {
  id: string;
  created_at: string;
  /** Última vez que um volume foi marcado ou desmarcado (migração 0002). */
  updated_at?: string;
  notes: string | null;
  edition: Edition & { work: Work };
  owned: number[];
};

export type ReadingStatus = "reading" | "hiatus" | "paused" | "finished" | "dropped";

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  reading: "Lendo",
  hiatus: "Em hiato",
  paused: "Pausado",
  finished: "Concluído",
  dropped: "Abandonado",
};

export type ReadingEntry = {
  id: string;
  work_id: string | null;
  title: string;
  cover_url: string | null;
  status: ReadingStatus;
  last_chapter: number | null;
  latest_released_chapter: number | null;
  source_url: string | null;
  notes: string | null;
  last_read_at: string;
};

export type Reminder = {
  id: string;
  reading_entry_id: string | null;
  remind_on: string;
  message: string;
  sent_at: string | null;
};

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** Encontra a obra pelo id externo ou cadastra no catálogo compartilhado. */
export async function ensureWork(r: CatalogResult): Promise<Work> {
  if (isDemo) return demoDb.ensureWork(r);
  let column = r.source === "anilist" ? "anilist_id" : r.source === "open_library" ? "open_library_id" : "google_books_id";
  let externalId: string | number = r.source === "anilist" ? Number(r.externalId) : r.externalId;

  let lookup = await supabase.from("works").select("*").eq(column, externalId).maybeSingle();
  if (column === "open_library_id" && isMissingColumn(lookup.error)) {
    // Migração 0003 ainda não rodou: guarda o id do Open Library em google_books_id com prefixo.
    column = "google_books_id";
    externalId = `ol:${r.externalId}`;
    lookup = await supabase.from("works").select("*").eq(column, externalId).maybeSingle();
  }
  const existing = check(lookup);
  if (existing) return existing as Work;

  const row = {
    kind: r.kind,
    title: r.title,
    original_title: r.originalTitle,
    authors: r.authors,
    cover_url: r.coverUrl,
    cover_color: r.coverColor,
    original_volumes: r.volumes,
    is_adult: r.isAdult === true,
    [column]: externalId,
  };
  let result = await supabase.from("works").insert(row).select("*").single();
  if (isMissingColumn(result.error)) {
    // Migrações 0002/0005 ainda não rodaram: grava sem a cor e sem a marca +18.
    const { cover_color: _, is_adult: __, ...basic } = row;
    result = await supabase.from("works").insert(basic).select("*").single();
  }
  return check(result) as Work;
}

export async function listEditions(workId: string): Promise<Edition[]> {
  if (isDemo) return demoDb.listEditions(workId);
  return check(
    await supabase.from("editions").select("*").eq("work_id", workId).order("created_at"),
  ) as Edition[];
}

export async function createEdition(input: Omit<Edition, "id">): Promise<Edition> {
  if (isDemo) return demoDb.createEdition(input);
  return check(await supabase.from("editions").insert(input).select("*").single()) as Edition;
}

export async function updateEdition(id: string, patch: Partial<Omit<Edition, "id" | "work_id">>) {
  if (isDemo) return demoDb.updateEdition(id, patch);
  check(await supabase.from("editions").update(patch).eq("id", id));
}

// ---------------------------------------------------------------------------
// Coleção física
// ---------------------------------------------------------------------------
const COLLECTION_SELECT =
  "id, created_at, notes, edition:editions(*, work:works(*)), owned_volumes(volume_number)";
const COLLECTION_SELECT_V2 = COLLECTION_SELECT.replace("created_at,", "created_at, updated_at,");

/** Coluna ainda não existe (migração 0002 não rodou): Postgres 42703 ou PostgREST PGRST204. */
function isMissingColumn(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

let hasActivityColumn: boolean | null = null;

type CollectionRow = Omit<CollectionItem, "owned"> & { owned_volumes: { volume_number: number }[] };

/**
 * Volumes marcados acima do total da edição não contam: a edição é compartilhada
 * e alguém pode ter corrigido o total para menos (ex.: 300 → 110).
 */
export function ownedWithinTotal(owned: number[], total: number | null) {
  return owned.filter((n) => total === null || n <= total).sort((a, b) => a - b);
}

function toItem(row: CollectionRow): CollectionItem {
  const { owned_volumes, ...rest } = row;
  return { ...rest, owned: ownedWithinTotal(owned_volumes.map((v) => v.volume_number), rest.edition.total_volumes) };
}

/** Volumes gravados acima do total (inclui os que `toItem` esconde). */
export async function volumesAbove(collectionId: string, total: number): Promise<number[]> {
  if (isDemo) return demoDb.volumesAbove(collectionId, total);
  const rows = check(
    await supabase.from("owned_volumes").select("volume_number").eq("collection_id", collectionId).gt("volume_number", total),
  ) as { volume_number: number }[];
  return rows.map((r) => r.volume_number).sort((a, b) => a - b);
}

/** Ordena pela última atividade (últimas adições primeiro). */
export async function listCollection(): Promise<CollectionItem[]> {
  if (isDemo) return demoDb.listCollection();
  type Result = { data: unknown; error: { message: string; code?: string } | null };
  let result: Result | null = null;
  if (hasActivityColumn !== false) {
    result = await supabase.from("collections").select(COLLECTION_SELECT_V2).order("updated_at", { ascending: false });
  }
  if (!result || isMissingColumn(result.error)) {
    hasActivityColumn = false;
    result = await supabase.from("collections").select(COLLECTION_SELECT).order("created_at", { ascending: false });
  } else {
    hasActivityColumn = true;
  }
  const items = (check(result) as CollectionRow[]).map(toItem);
  return items;
}


export async function getCollectionItem(id: string): Promise<CollectionItem> {
  if (isDemo) return demoDb.getCollectionItem(id);
  const row = check(
    await supabase.from("collections").select(COLLECTION_SELECT).eq("id", id).single(),
  ) as unknown as CollectionRow;
  return toItem(row);
}

/** Adiciona a edição à coleção do usuário (ou devolve a existente). */
export async function addToCollection(editionId: string): Promise<string> {
  if (isDemo) return demoDb.addToCollection(editionId);
  const row = check(
    await supabase
      .from("collections")
      .upsert({ edition_id: editionId }, { onConflict: "user_id,edition_id" })
      .select("id")
      .single(),
  ) as { id: string };
  return row.id;
}

export async function removeFromCollection(collectionId: string) {
  if (isDemo) return demoDb.removeFromCollection(collectionId);
  check(await supabase.from("collections").delete().eq("id", collectionId));
}

export async function setVolumesOwned(collectionId: string, volumes: number[], owned: boolean) {
  if (isDemo) return demoDb.setVolumesOwned(collectionId, volumes, owned);
  if (volumes.length === 0) return;
  if (owned) {
    check(
      await supabase
        .from("owned_volumes")
        .upsert(
          volumes.map((volume_number) => ({ collection_id: collectionId, volume_number })),
          { onConflict: "collection_id,volume_number", ignoreDuplicates: true },
        ),
    );
  } else {
    check(
      await supabase
        .from("owned_volumes")
        .delete()
        .eq("collection_id", collectionId)
        .in("volume_number", volumes),
    );
  }
}

// ---------------------------------------------------------------------------
// Onde parei (capítulo dos mangás lidos em outros sites)
// ---------------------------------------------------------------------------
export async function listReading(): Promise<ReadingEntry[]> {
  if (isDemo) return demoDb.listReading();
  return check(
    await supabase.from("reading_entries").select("*").order("last_read_at", { ascending: false }),
  ) as ReadingEntry[];
}

export type ReadingInput = Partial<Omit<ReadingEntry, "id">> & { title: string };

export async function saveReading(input: ReadingInput & { id?: string }): Promise<ReadingEntry> {
  if (isDemo) return demoDb.saveReading(input);
  const { id, ...fields } = input;
  const query = id
    ? supabase.from("reading_entries").update(fields).eq("id", id)
    : supabase.from("reading_entries").insert(fields);
  return check(await query.select("*").single()) as ReadingEntry;
}

export async function deleteReading(id: string) {
  if (isDemo) return demoDb.deleteReading(id);
  check(await supabase.from("reading_entries").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------
export async function listReminders(): Promise<(Reminder & { reading: { title: string } | null })[]> {
  if (isDemo) return demoDb.listReminders();
  return check(
    await supabase
      .from("reminders")
      .select("*, reading:reading_entries(title)")
      .order("remind_on", { ascending: true }),
  ) as unknown as (Reminder & { reading: { title: string } | null })[];
}

export async function createReminder(input: Omit<Reminder, "id" | "sent_at">) {
  if (isDemo) return demoDb.createReminder(input);
  check(await supabase.from("reminders").insert(input));
}

export async function deleteReminder(id: string) {
  if (isDemo) return demoDb.deleteReminder(id);
  check(await supabase.from("reminders").delete().eq("id", id));
}

/** Marca obras como +18 (para séries adicionadas antes da migração 0005). */
export async function markWorksAdult(anilistIds: number[]) {
  if (isDemo || anilistIds.length === 0) return;
  await supabase.from("works").update({ is_adult: true }).in("anilist_id", anilistIds);
}
