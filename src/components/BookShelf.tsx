import { Link } from "react-router-dom";
import type { CollectionItem } from "../lib/db";
import "./BookShelf.css";

/** Obra de volume único (livro avulso): não tem "o que falta" para mostrar. */
export function isStandalone(item: CollectionItem) {
  const total = item.edition.total_volumes ?? Math.max(0, ...item.owned);
  return total <= 1;
}

/**
 * Prateleira de capas para livros avulsos: vários livros lado a lado no espaço
 * de um nicho, em vez de um nicho inteiro com faixa de volumes para cada um.
 */
export function BookShelf({ items, compact = false }: { items: CollectionItem[]; compact?: boolean }) {
  return (
    <ul className={compact ? "book-shelf is-compact" : "book-shelf"}>
      {items.map((item) => {
        const { work } = item.edition;
        return (
          <li key={item.id}>
            <Link to={`/colecao/${item.id}`} className="book" title={work.title}>
              {work.cover_url ? (
                <img className="book-cover" src={work.cover_url} alt="" loading="lazy" />
              ) : (
                <span className="book-cover book-cover-empty" aria-hidden="true">{work.title.slice(0, 1)}</span>
              )}
              <span className="book-title">{work.title}</span>
              {!compact && work.authors.length > 0 && <span className="book-author">{work.authors[0]}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
