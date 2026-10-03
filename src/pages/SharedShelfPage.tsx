import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSharedShelf, type SharedItem } from "../lib/db";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { seriesHueAt } from "../lib/spineColor";
import { nicheClass, seriesUnits, SpineStrip } from "../components/Shelf";
import { packShelf } from "../lib/packShelf";
import { useColumns } from "../lib/useColumns";
import { VolumeCount } from "../components/VolumeCount";
import { ThemeToggle } from "../components/ThemeToggle";
import "../components/BookShelf.css";
import "./pages.css";
import "./SharedShelfPage.css";

const totalOf = (i: SharedItem) => i.total_volumes ?? Math.max(0, ...i.owned);
const isBook = (i: SharedItem) => totalOf(i) <= 1;

/** Estante de outra pessoa, somente leitura, aberta pelo link (sem login). */
export function SharedShelfPage({ token }: { token: string }) {
  const shelf = useQuery({ queryKey: ["shared-shelf", token], queryFn: () => fetchSharedShelf(token), retry: false });
  const cols = useColumns([[1400, 3], [900, 2]]);

  // Página privada de quem recebeu o link: fora dos buscadores.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const data = shelf.data;
  const all = data?.items ?? [];
  const series = all.filter((i) => !isBook(i));
  const books = all.filter(isBook);
  const volumes = all.reduce((sum, i) => sum + i.owned.length, 0);
  const hueOf = new Map(all.map((i, n) => [i.id, seriesHueAt(all.length - 1 - n)]));

  return (
    <div className="shared">
      <header className="shared-top">
        <a href="/" className="shared-brand" aria-label="Lombada, ir para o início">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <span>Lombada</span>
        </a>
        <ThemeToggle className="btn btn-ghost" />
      </header>

      <main className="page">
        {shelf.isLoading && <p className="muted">Abrindo a estante…</p>}
        {shelf.error && <p className="error" role="alert">{(shelf.error as Error).message}</p>}

        {shelf.isSuccess && !data && (
          <div className="empty">
            <h1>Esta estante não está disponível</h1>
            <p>O link pode ter sido desligado ou trocado por quem o compartilhou. Peça um link novo.</p>
          </div>
        )}

        {data && (
          <>
            <header className="page-head">
              <div>
                <h1>Estante de {data.owner}</h1>
                <p>
                  <span className="num">{volumes}</span> volumes em <span className="num">{all.length}</span>{" "}
                  {all.length === 1 ? "obra" : "obras"}
                </p>
              </div>
            </header>

            {all.length === 0 && <p className="muted">Esta estante ainda está vazia.</p>}

            {series.length > 0 && (
              <ul className="series-list">
                {packShelf(series, (i) => seriesUnits(totalOf(i)), cols * 2).placed.map(({ item, span }) => (
                  <SharedSeries key={item.id} item={item} span={span} hue={hueOf.get(item.id) ?? 0} />
                ))}
              </ul>
            )}

            {books.length > 0 && (
              <section className="books-section" aria-labelledby="shared-books">
                <h2 id="shared-books">
                  Livros avulsos <span className="hint">{books.length}</span>
                </h2>
                <div className="books-case">
                  <ul className="book-shelf">
                    {books.map((b) => (
                      <li key={b.id}>
                        <div className="book" title={b.title}>
                          {b.cover_url ? (
                            <img className="book-cover" src={b.cover_url} alt="" loading="lazy" />
                          ) : (
                            <span className="book-cover book-cover-empty" aria-hidden="true">{b.title.slice(0, 1)}</span>
                          )}
                          <span className="book-title">{b.title}</span>
                          {b.authors.length > 0 && <span className="book-author">{b.authors[0]}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <p className="shared-cta">
              Quer organizar a sua coleção também? <a href="/">Crie a sua estante no Lombada</a>, é grátis.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function SharedSeries({ item, span, hue }: { item: SharedItem; span: number; hue: number }) {
  const total = totalOf(item);
  const missing = missingVolumes(item.owned, item.total_volumes);
  const complete = item.total_volumes !== null && missing.length === 0;
  const edition = item.edition_name && item.edition_name !== item.title ? item.edition_name : null;

  return (
    <li className={nicheClass(total)} style={{ gridColumn: `span ${span}` }}>
      <div className="series-row">
        {item.cover_url ? (
          <img className="cover cover-s" src={item.cover_url} alt="" loading="lazy" />
        ) : (
          <div className="cover cover-s cover-empty" aria-hidden="true">{item.title.slice(0, 1)}</div>
        )}
        <div className="series-body">
          <div className="series-title">
            <div className="series-name">
              <h2>{item.title}</h2>
              {edition && <span className="series-edition">{edition}</span>}
            </div>
            <VolumeCount owned={item.owned.length} total={item.total_volumes} />
          </div>
          <SpineStrip total={total} owned={new Set(item.owned)} hue={hue} />
          <p className="series-status">
            {complete ? (
              <span className="series-missing">Coleção completa</span>
            ) : missing.length > 0 ? (
              <span className="series-missing is-gap">Faltam {formatRanges(missing)}</span>
            ) : (
              <span className="muted">Total de volumes não informado</span>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}
