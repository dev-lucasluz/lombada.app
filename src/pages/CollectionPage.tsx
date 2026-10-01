import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCollection, type CollectionItem } from "../lib/db";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { seriesHue, seriesHues } from "../lib/spineColor";
import { PageCorner } from "../components/PageCorner";
import { nicheClass, seriesUnits, SpineStrip } from "../components/Shelf";
import { packShelf } from "../lib/packShelf";
import { useColumns } from "../lib/useColumns";
import { Icon } from "../components/Icon";
import { VolumeCount } from "../components/VolumeCount";
import { BookShelf, isStandalone } from "../components/BookShelf";
import { editionLabel } from "../lib/editionLabel";
import "./pages.css";

export function CollectionPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["collection"], queryFn: listCollection });

  const totalOwned = data?.reduce((sum, c) => sum + c.owned.length, 0) ?? 0;
  const cols = useColumns([[1400, 3], [900, 2]]);
  const hues = seriesHues(data ?? []);
  const books = data?.filter(isStandalone) ?? [];
  // +18 fica escondido até o usuário clicar no botão; a escolha é lembrada neste aparelho.
  const [showAdult, setShowAdult] = useState(() => {
    try { return localStorage.getItem("lombada-show-adult") === "1"; } catch { return false; }
  });
  const toggleAdult = () => {
    setShowAdult((v) => {
      try { localStorage.setItem("lombada-show-adult", v ? "0" : "1"); } catch { /* sem armazenamento */ }
      return !v;
    });
  };
  const allSeries = data?.filter((i) => !isStandalone(i)) ?? [];
  const hasAdult = allSeries.some((i) => i.edition.work.is_adult);
  const series = showAdult ? allSeries : allSeries.filter((i) => !i.edition.work.is_adult);

  return (
    <div className="page">
      <header className="page-head">
        <PageCorner />
        <div>
          <h1>Coleção</h1>
          {data && data.length > 0 && (
            <p>
              <span className="num">{totalOwned}</span> volumes em{" "}
              <span className="num">{data.length}</span> {data.length === 1 ? "série" : "séries"}
            </p>
          )}
        </div>
        <div className="head-actions">
          {data && data.length > 0 && (
            <Link to="/compras" className="btn btn-ghost">Lista de compras</Link>
          )}
          <Link to="/adicionar" className="btn btn-primary">Adicionar série</Link>
        </div>
      </header>

      {isLoading && <p className="muted">Carregando sua coleção…</p>}
      {error && <p className="error" role="alert">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="empty">
          <h2>Sua estante está vazia</h2>
          <p>Busque um mangá ou livro, escolha a edição e marque os volumes que você tem.</p>
          <Link to="/adicionar" className="btn btn-primary">Adicionar a primeira série</Link>
        </div>
      )}

      {hasAdult && (
        <div className="segmented" role="group" aria-label="Conteúdo +18">
          <button aria-pressed={showAdult} onClick={toggleAdult}>
            {showAdult ? "Esconder +18" : "Mostrar +18"}
          </button>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="series-list">
          {packShelf(series, (i) => seriesUnits(seriesTotal(i)), cols * 2).placed.map(({ item, span }) => (
            <SeriesRow key={item.id} item={item} span={span} hue={hues.get(item.id) ?? seriesHue(item.edition.id)} />
          ))}
          <li className="series-add is-full">
            <Link to="/adicionar">
              <Icon name="plus" size={20} /> Adicionar série
            </Link>
          </li>
        </ul>
      )}

      {books.length > 0 && (
        <section className="books-section" aria-labelledby="books-title">
          <h2 id="books-title">
            Livros avulsos <span className="hint">{books.length}</span>
          </h2>
          <div className="books-case">
            <BookShelf items={books} />
          </div>
        </section>
      )}
    </div>
  );
}

function seriesTotal(item: CollectionItem) {
  return item.edition.total_volumes ?? Math.max(0, ...item.owned);
}

function SeriesRow({ item, span, hue }: { item: CollectionItem; span: number; hue: number }) {
  const { edition } = item;
  const total = seriesTotal(item);
  const missing = missingVolumes(item.owned, edition.total_volumes);
  const complete = edition.total_volumes !== null && missing.length === 0;

  return (
    <li className={nicheClass(total)} style={{ gridColumn: `span ${span}` }}>
      <Link to={`/colecao/${item.id}`} className="series-row">
        <Cover url={edition.work.cover_url} title={edition.work.title} />
        <div className="series-body">
          <div className="series-title">
            <div className="series-name">
              <h2>{edition.work.title}{edition.work.is_adult && <span className="badge-adult">+18</span>}</h2>
              {editionLabel(edition, edition.work.title) && (
                <span className="series-edition">{editionLabel(edition, edition.work.title)}</span>
              )}
            </div>
            <VolumeCount owned={item.owned.length} total={edition.total_volumes} />
          </div>
          <SpineStrip total={total} owned={new Set(item.owned)} hue={hue} />
          <p className="series-status">
            {complete ? (
              <span className="series-missing">Coleção completa</span>
            ) : missing.length > 0 ? (
              <span className="series-missing">Faltam {formatRanges(missing)}</span>
            ) : (
              <span className="muted">Total de volumes não informado</span>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function Cover({ url, title, size = "s" }: { url: string | null; title: string; size?: "s" | "l" }) {
  return url ? (
    <img className={`cover cover-${size}`} src={url} alt="" loading="lazy" />
  ) : (
    <div className={`cover cover-${size} cover-empty`} aria-hidden="true">
      {title.slice(0, 1)}
    </div>
  );
}
