/**
 * Modo demonstração (só em desenvolvimento): `npm run dev:demo`.
 * Pula o login e troca o Supabase por dados de exemplo guardados no navegador,
 * para testar as telas internas sem conta. `import.meta.env.DEV` é falso no
 * build de produção, então este modo nunca chega ao site publicado.
 */
import type { CatalogResult } from "./catalog";
import { ownedWithinTotal, type CollectionItem, type Edition, type ReadingEntry, type Reminder, type Work } from "./db";

export const isDemo = import.meta.env.DEV && import.meta.env.VITE_DEMO === "true";

type Store = {
  works: Work[];
  editions: Edition[];
  collections: { id: string; edition_id: string; created_at: string; updated_at?: string; notes: string | null; owned: number[] }[];
  reading: ReadingEntry[];
  reminders: Reminder[];
};

const KEY = "lombada-demo";
const uid = () => Math.random().toString(36).slice(2, 10);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

function work(id: string, title: string, volumes: number | null, anilist: number, cover: string | null, color: string | null = null): Work {
  return {
    id, kind: "manga", title, original_title: null, authors: [], cover_url: cover, cover_color: color,
    original_volumes: volumes, anilist_id: anilist, google_books_id: null,
  };
}

function seed(): Store {
  const now = Date.now();
  return {
    works: [
      work("w1", "One Punch-Man", null, 74347, null, "#f1a150"),
      work("w2", "Berserk", 42, 30002, null, "#1a1a1a"),
      work("w3", "Naruto", 72, 30011, null, "#e48a28"),
    ],
    editions: [
      { id: "e1", work_id: "w1", name: "One Punch-Man", publisher: "Panini", total_volumes: 31, is_finished: false },
      { id: "e2", work_id: "w2", name: "Berserk Edição de Luxo", publisher: "Panini", total_volumes: 42, is_finished: true },
      { id: "e3", work_id: "w3", name: "Naruto Gold", publisher: "Panini", total_volumes: 72, is_finished: true },
    ],
    collections: [
      { id: "c1", edition_id: "e1", created_at: new Date(now).toISOString(), notes: null, owned: [...range(1, 7), ...range(9, 10), ...range(12, 31)] },
      { id: "c2", edition_id: "e2", created_at: new Date(now - 1000).toISOString(), notes: null, owned: range(1, 18) },
      { id: "c3", edition_id: "e3", created_at: new Date(now - 2000).toISOString(), notes: null, owned: [...range(1, 30), ...range(41, 48)] },
    ],
    reading: [
      { id: "r1", work_id: null, title: "Kagurabachi", cover_url: null, status: "reading", last_chapter: 57, latest_released_chapter: null, source_url: null, notes: null, last_read_at: new Date(now - 86400000).toISOString() },
      { id: "r2", work_id: null, title: "Hunter x Hunter", cover_url: null, status: "hiatus", last_chapter: 400, latest_released_chapter: 410, source_url: null, notes: "Volta prevista para outubro", last_read_at: new Date(now - 40 * 86400000).toISOString() },
    ],
    reminders: [
      { id: "m1", reading_entry_id: "r2", remind_on: daysFromNow(0), message: "Ver se Hunter x Hunter voltou do hiato", sent_at: null },
      { id: "m2", reading_entry_id: null, remind_on: daysFromNow(12), message: "Lançamento do volume 32 de One Punch-Man", sent_at: null },
    ],
  };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    // Sem armazenamento: usa os dados de exemplo só nesta visita.
  }
  return seed();
}

// Carregada só no primeiro uso: sem efeito ao importar, o build de produção descarta tudo.
let cache: Store | null = null;
const db = (): Store => (cache ??= load());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    // Sem armazenamento: as mudanças valem só até recarregar.
  }
}

/** Pequena espera para a interface mostrar os estados de carregamento. */
const tick = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), 150));

function toItem(c: Store["collections"][number]): CollectionItem {
  const edition = db().editions.find((e) => e.id === c.edition_id)!;
  const w = db().works.find((x) => x.id === edition.work_id)!;
  return { id: c.id, created_at: c.created_at, updated_at: c.updated_at ?? c.created_at, notes: c.notes, edition: { ...edition, work: w }, owned: ownedWithinTotal(c.owned, edition.total_volumes) };
}

export const demoDb = {
  resetAll() {
    cache = seed();
    save();
  },

  async ensureWork(r: CatalogResult): Promise<Work> {
    const found = db().works.find((w) =>
      r.source === "anilist"
        ? w.anilist_id === Number(r.externalId)
        : r.source === "open_library"
          ? w.open_library_id === r.externalId
          : w.google_books_id === r.externalId,
    );
    if (found) return tick(found);
    const w: Work = {
      id: uid(), kind: r.kind, title: r.title, original_title: r.originalTitle, authors: r.authors,
      cover_url: r.coverUrl, cover_color: r.coverColor, original_volumes: r.volumes,
      anilist_id: r.source === "anilist" ? Number(r.externalId) : null,
      google_books_id: r.source === "google_books" ? r.externalId : null,
      open_library_id: r.source === "open_library" ? r.externalId : null,
    };
    db().works.push(w);
    save();
    return tick(w);
  },

  async listEditions(workId: string) {
    return tick(db().editions.filter((e) => e.work_id === workId));
  },

  async createEdition(input: Omit<Edition, "id">) {
    const e = { ...input, id: uid() };
    db().editions.push(e);
    save();
    return tick(e);
  },

  async updateEdition(id: string, patch: Partial<Omit<Edition, "id" | "work_id">>) {
    db().editions = db().editions.map((e) => (e.id === id ? { ...e, ...patch } : e));
    save();
    await tick(null);
  },

  async listCollection() {
    const recent = (c: Store["collections"][number]) => c.updated_at ?? c.created_at;
    return tick([...db().collections].sort((a, b) => recent(b).localeCompare(recent(a))).map(toItem));
  },

  async getCollectionItem(id: string) {
    const c = db().collections.find((x) => x.id === id);
    if (!c) throw new Error("Não encontrado");
    return tick(toItem(c));
  },

  async addToCollection(editionId: string) {
    const existing = db().collections.find((c) => c.edition_id === editionId);
    if (existing) return tick(existing.id);
    const c = { id: uid(), edition_id: editionId, created_at: new Date().toISOString(), notes: null, owned: [] };
    db().collections.push(c);
    save();
    return tick(c.id);
  },

  async removeFromCollection(collectionId: string) {
    db().collections = db().collections.filter((c) => c.id !== collectionId);
    save();
    await tick(null);
  },

  async setVolumesOwned(collectionId: string, volumes: number[], owned: boolean) {
    const c = db().collections.find((x) => x.id === collectionId);
    if (!c) throw new Error("Não encontrado");
    const set = new Set(c.owned);
    volumes.forEach((v) => (owned ? set.add(v) : set.delete(v)));
    c.owned = [...set];
    c.updated_at = new Date().toISOString();
    save();
    await tick(null);
  },

  async volumesAbove(collectionId: string, total: number) {
    const c = db().collections.find((x) => x.id === collectionId);
    return tick((c?.owned ?? []).filter((n) => n > total).sort((a, b) => a - b));
  },

  async listReading() {
    return tick([...db().reading].sort((a, b) => b.last_read_at.localeCompare(a.last_read_at)));
  },

  async saveReading(input: Partial<Omit<ReadingEntry, "id">> & { title: string; id?: string }) {
    const { id, ...fields } = input;
    let entry: ReadingEntry;
    if (id) {
      db().reading = db().reading.map((r) => (r.id === id ? { ...r, ...fields } : r));
      entry = db().reading.find((r) => r.id === id)!;
    } else {
      entry = {
        id: uid(), work_id: null, cover_url: null, status: "reading", last_chapter: null,
        latest_released_chapter: null, source_url: null, notes: null, last_read_at: new Date().toISOString(),
        ...fields,
      };
      db().reading.push(entry);
    }
    save();
    return tick(entry);
  },

  async deleteReading(id: string) {
    db().reading = db().reading.filter((r) => r.id !== id);
    db().reminders = db().reminders.filter((m) => m.reading_entry_id !== id);
    save();
    await tick(null);
  },

  async listReminders() {
    return tick(
      [...db().reminders]
        .sort((a, b) => a.remind_on.localeCompare(b.remind_on))
        .map((m) => ({ ...m, reading: m.reading_entry_id ? { title: db().reading.find((r) => r.id === m.reading_entry_id)?.title ?? "" } : null })),
    );
  },

  async createReminder(input: Omit<Reminder, "id" | "sent_at">) {
    db().reminders.push({ ...input, id: uid(), sent_at: null });
    save();
    await tick(null);
  },

  async deleteReminder(id: string) {
    db().reminders = db().reminders.filter((m) => m.id !== id);
    save();
    await tick(null);
  },
};
