/**
 * Busca em catálogos externos gratuitos (sem chave de API):
 * - AniList (GraphQL) para mangás
 * - Open Library para livros (Google Books como reserva)
 */

export type CatalogResult = {
  source: "anilist" | "google_books" | "open_library";
  externalId: string;
  kind: "manga" | "book";
  title: string;
  originalTitle: string | null;
  authors: string[];
  coverUrl: string | null;
  /** Cor predominante da capa (#rrggbb), quando o catálogo informa (AniList). */
  coverColor: string | null;
  /** Total de volumes da edição original; nulo se em lançamento ou desconhecido. */
  volumes: number | null;
  status: string | null;
  year: number | null;
  /** Obra marcada como +18 pelo catálogo (AniList). */
  isAdult?: boolean;
};

const ANILIST_QUERY = `
query ($search: String) {
  Page(perPage: 12) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      isAdult
      title { romaji english native }
      volumes
      status
      startDate { year }
      coverImage { large color }
      staff(perPage: 3, sort: RELEVANCE) { edges { role node { name { full } } } }
    }
  }
}`;

type AniListMedia = {
  id: number;
  isAdult: boolean | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  volumes: number | null;
  status: string | null;
  startDate: { year: number | null } | null;
  coverImage: { large: string | null; color: string | null } | null;
  staff: { edges: { role: string; node: { name: { full: string } } }[] } | null;
};

const ANILIST_STATUS: Record<string, string> = {
  FINISHED: "Finalizado",
  RELEASING: "Em lançamento",
  HIATUS: "Em hiato",
  NOT_YET_RELEASED: "Não lançado",
  CANCELLED: "Cancelado",
};

export async function searchManga(term: string): Promise<CatalogResult[]> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: term } }),
  });
  if (!res.ok) throw new Error("Não foi possível buscar no AniList agora. Tente de novo em alguns segundos.");
  const json = (await res.json()) as { data: { Page: { media: AniListMedia[] } } };

  return json.data.Page.media.map((m) => ({
    source: "anilist",
    externalId: String(m.id),
    kind: "manga",
    title: m.title.romaji ?? m.title.english ?? m.title.native ?? "Sem título",
    originalTitle: m.title.native,
    authors: (m.staff?.edges ?? [])
      .filter((e) => /story|art/i.test(e.role))
      .map((e) => e.node.name.full)
      .filter((v, i, a) => a.indexOf(v) === i),
    coverUrl: m.coverImage?.large ?? null,
    coverColor: m.coverImage?.color ?? null,
    volumes: m.volumes,
    status: m.status ? ANILIST_STATUS[m.status] ?? m.status : null,
    year: m.startDate?.year ?? null,
    isAdult: m.isAdult === true,
  }));
}

type GoogleBooksItem = {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string };
  };
};

type OpenLibraryDoc = {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  /** Com `lang=por`, traz a edição em português que casou com a busca. */
  editions?: { docs?: { title?: string; cover_i?: number; language?: string[] }[] };
};

/**
 * Livros: Open Library primeiro (grátis, sem chave e sem cota compartilhada).
 * O Google Books sem chave divide uma cota diária com o mundo todo e vive
 * esgotado, então fica só como reserva.
 */
export async function searchBooks(term: string): Promise<CatalogResult[]> {
  // Com chave própria (VITE_GOOGLE_BOOKS_API_KEY) o Google Books vem primeiro: tem
  // lançamentos recentes e edições brasileiras. Sem chave, a cota é compartilhada
  // com o mundo todo e quase sempre esgotada, então o Open Library lidera.
  const order = GOOGLE_BOOKS_KEY ? [searchGoogleBooks, searchOpenLibrary] : [searchOpenLibrary, searchGoogleBooks];
  let firstError: unknown = null;
  for (const search of order) {
    try {
      const results = await search(term);
      if (results.length > 0) return results;
    } catch (err) {
      firstError ??= err;
    }
  }
  if (firstError) throw firstError;
  return [];
}

const GOOGLE_BOOKS_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY as string | undefined;

async function searchOpenLibrary(term: string): Promise<CatalogResult[]> {
  const params = new URLSearchParams({
    q: term,
    limit: "12",
    lang: "por", // prefere edições em português quando existem
    fields: "key,title,subtitle,author_name,first_publish_year,cover_i,editions,editions.title,editions.cover_i,editions.language",
  });
  const res = await fetch(`https://openlibrary.org/search.json?${params}`);
  if (!res.ok) throw new Error("Open Library indisponível");
  const json = (await res.json()) as { docs?: OpenLibraryDoc[] };
  return (json.docs ?? []).map((d) => {
    const original = d.subtitle ? `${d.title}: ${d.subtitle}` : d.title;
    // Título e capa da edição brasileira/portuguesa, quando existe
    const pt = d.editions?.docs?.find((e) => e.language?.includes("por") && e.title);
    const cover = pt?.cover_i ?? d.cover_i;
    return {
    source: "open_library" as const,
    externalId: d.key,
    kind: "book" as const,
    title: pt?.title ?? original,
    originalTitle: pt?.title && pt.title !== original ? original : null,
    authors: d.author_name?.slice(0, 3) ?? [],
    coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : null,
    coverColor: null,
    volumes: 1,
    status: null,
    year: d.first_publish_year ?? null,
    };
  });
}

async function searchGoogleBooks(term: string): Promise<CatalogResult[]> {
  const params = new URLSearchParams({ q: term, maxResults: "12", printType: "books", langRestrict: "pt" });
  if (GOOGLE_BOOKS_KEY) params.set("key", GOOGLE_BOOKS_KEY);
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) throw new Error("A busca de livros está fora do ar agora. Tente de novo em alguns minutos.");
  const json = (await res.json()) as { items?: GoogleBooksItem[] };

  return (json.items ?? []).map((b) => ({
    source: "google_books",
    externalId: b.id,
    kind: "book",
    title: b.volumeInfo.subtitle ? `${b.volumeInfo.title}: ${b.volumeInfo.subtitle}` : b.volumeInfo.title,
    originalTitle: null,
    authors: b.volumeInfo.authors ?? [],
    coverUrl: b.volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
    coverColor: null,
    volumes: 1,
    status: null,
    year: b.volumeInfo.publishedDate ? Number(b.volumeInfo.publishedDate.slice(0, 4)) : null,
  }));
}

/** Cores de capa de várias obras do AniList de uma vez (para obras antigas sem cor salva). */
export async function fetchAniListColors(ids: number[]): Promise<Map<number, string>> {
  const colors = new Map<number, string>();
  if (ids.length === 0) return colors;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: "query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: MANGA) { id coverImage { color } } } }",
      variables: { ids: ids.slice(0, 50) },
    }),
  });
  if (!res.ok) return colors;
  const json = (await res.json()) as { data?: { Page: { media: { id: number; coverImage: { color: string | null } | null }[] } } };
  for (const m of json.data?.Page.media ?? []) {
    if (m.coverImage?.color) colors.set(m.id, m.coverImage.color);
  }
  return colors;
}
