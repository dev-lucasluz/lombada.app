import type { CollectionItem } from "./db";
import { normalizeTitle } from "./quickAdd";

/** Livros que dizem pertencer a uma série (migração 0016) são juntados numa faixa de lombadas. */
export type BookSeries = {
  key: string;
  /** Nome da série como a pessoa digitou (do primeiro livro). */
  name: string;
  /** Livros da coleção, em ordem de número (os sem número vão por último). */
  books: CollectionItem[];
  /** Números dos livros que a pessoa tem. */
  owned: number[];
  /** Quantos livros a série tem: o maior entre o total informado, o maior número e a quantidade de livros. */
  total: number;
  /** Total informado pela pessoa; nulo se nenhum livro informou. */
  declaredTotal: number | null;
};

export function seriesName(item: CollectionItem) {
  return item.edition.series_name?.trim() || null;
}

export function isInBookSeries(item: CollectionItem) {
  return seriesName(item) !== null;
}

export function groupBookSeries(items: CollectionItem[]): BookSeries[] {
  const groups = new Map<string, CollectionItem[]>();
  for (const item of items) {
    const name = seriesName(item);
    if (!name) continue;
    const key = normalizeTitle(name);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const books = [...list].sort(
      (a, b) =>
        (a.edition.series_number ?? Infinity) - (b.edition.series_number ?? Infinity) ||
        a.edition.work.title.localeCompare(b.edition.work.title),
    );
    const owned = [...new Set(books.map((b) => b.edition.series_number).filter((n): n is number => typeof n === "number"))];
    const totals = books.map((b) => b.edition.series_total).filter((n): n is number => typeof n === "number");
    const declaredTotal = totals.length ? Math.max(...totals) : null;
    const total = Math.max(declaredTotal ?? 0, ...owned, books.length);
    return { key, name: seriesName(books[0])!, books, owned, total, declaredTotal };
  });
}
