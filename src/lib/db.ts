import { supabase } from "./supabase";
import type { CatalogResult } from "./catalog";

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
  original_volumes: number | null;
  anilist_id: number | null;
  google_books_id: string | null;
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
  const column = r.source === "anilist" ? "anilist_id" : "google_books_id";
  const externalId = r.source === "anilist" ? Number(r.externalId) : r.externalId;

  const existing = check(await supabase.from("works").select("*").eq(column, externalId).maybeSingle());
  if (existing) return existing as Work;

  return check(
    await supabase
      .from("works")
      .insert({
        kind: r.kind,
        title: r.title,
        original_title: r.originalTitle,
        authors: r.authors,
        cover_url: r.coverUrl,
        original_volumes: r.volumes,
        [column]: externalId,
      })
      .select("*")
      .single(),
  ) as Work;
}

export async function listEditions(workId: string): Promise<Edition[]> {
  return check(
    await supabase.from("editions").select("*").eq("work_id", workId).order("created_at"),
  ) as Edition[];
}

export async function createEdition(input: Omit<Edition, "id">): Promise<Edition> {
  return check(await supabase.from("editions").insert(input).select("*").single()) as Edition;
}

export async function updateEdition(id: string, patch: Partial<Omit<Edition, "id" | "work_id">>) {
  check(await supabase.from("editions").update(patch).eq("id", id));
}

// ---------------------------------------------------------------------------
// Coleção física
// ---------------------------------------------------------------------------
const COLLECTION_SELECT =
  "id, created_at, notes, edition:editions(*, work:works(*)), owned_volumes(volume_number)";

type CollectionRow = Omit<CollectionItem, "owned"> & { owned_volumes: { volume_number: number }[] };

function toItem(row: CollectionRow): CollectionItem {
  const { owned_volumes, ...rest } = row;
  return { ...rest, owned: owned_volumes.map((v) => v.volume_number).sort((a, b) => a - b) };
}

export async function listCollection(): Promise<CollectionItem[]> {
  const rows = check(
    await supabase.from("collections").select(COLLECTION_SELECT).order("created_at", { ascending: false }),
  ) as unknown as CollectionRow[];
  return rows.map(toItem);
}

export async function getCollectionItem(id: string): Promise<CollectionItem> {
  const row = check(
    await supabase.from("collections").select(COLLECTION_SELECT).eq("id", id).single(),
  ) as unknown as CollectionRow;
  return toItem(row);
}

/** Adiciona a edição à coleção do usuário (ou devolve a existente). */
export async function addToCollection(editionId: string): Promise<string> {
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
  check(await supabase.from("collections").delete().eq("id", collectionId));
}

export async function setVolumesOwned(collectionId: string, volumes: number[], owned: boolean) {
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
// Leitura online
// ---------------------------------------------------------------------------
export async function listReading(): Promise<ReadingEntry[]> {
  return check(
    await supabase.from("reading_entries").select("*").order("last_read_at", { ascending: false }),
  ) as ReadingEntry[];
}

export type ReadingInput = Partial<Omit<ReadingEntry, "id">> & { title: string };

export async function saveReading(input: ReadingInput & { id?: string }): Promise<ReadingEntry> {
  const { id, ...fields } = input;
  const query = id
    ? supabase.from("reading_entries").update(fields).eq("id", id)
    : supabase.from("reading_entries").insert(fields);
  return check(await query.select("*").single()) as ReadingEntry;
}

export async function deleteReading(id: string) {
  check(await supabase.from("reading_entries").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------
export async function listReminders(): Promise<(Reminder & { reading: { title: string } | null })[]> {
  return check(
    await supabase
      .from("reminders")
      .select("*, reading:reading_entries(title)")
      .order("remind_on", { ascending: true }),
  ) as unknown as (Reminder & { reading: { title: string } | null })[];
}

export async function createReminder(input: Omit<Reminder, "id" | "sent_at">) {
  check(await supabase.from("reminders").insert(input));
}

export async function deleteReminder(id: string) {
  check(await supabase.from("reminders").delete().eq("id", id));
}
