/**
 * Busca em catálogos externos gratuitos (sem chave de API):
 * - AniList (GraphQL) para mangás
 * - Google Books para livros
 */

export type CatalogResult = {
  source: "anilist" | "google_books";
  externalId: string;
  kind: "manga" | "book";
  title: string;
  originalTitle: string | null;
  authors: string[];
  coverUrl: string | null;
  /** Total de volumes da edição original; nulo se em lançamento ou desconhecido. */
  volumes: number | null;
  status: string | null;
  year: number | null;
};

const ANILIST_QUERY = `
query ($search: String) {
  Page(perPage: 12) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      volumes
      status
      startDate { year }
      coverImage { large }
      staff(perPage: 3, sort: RELEVANCE) { edges { role node { name { full } } } }
    }
  }
}`;

type AniListMedia = {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  volumes: number | null;
  status: string | null;
  startDate: { year: number | null } | null;
  coverImage: { large: string | null } | null;
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
    volumes: m.volumes,
    status: m.status ? ANILIST_STATUS[m.status] ?? m.status : null,
    year: m.startDate?.year ?? null,
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

export async function searchBooks(term: string): Promise<CatalogResult[]> {
  const params = new URLSearchParams({ q: term, maxResults: "12", printType: "books", langRestrict: "pt" });
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) throw new Error("Não foi possível buscar no Google Books agora. Tente de novo em alguns segundos.");
  const json = (await res.json()) as { items?: GoogleBooksItem[] };

  return (json.items ?? []).map((b) => ({
    source: "google_books",
    externalId: b.id,
    kind: "book",
    title: b.volumeInfo.subtitle ? `${b.volumeInfo.title}: ${b.volumeInfo.subtitle}` : b.volumeInfo.title,
    originalTitle: null,
    authors: b.volumeInfo.authors ?? [],
    coverUrl: b.volumeInfo.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
    volumes: 1,
    status: null,
    year: b.volumeInfo.publishedDate ? Number(b.volumeInfo.publishedDate.slice(0, 4)) : null,
  }));
}
