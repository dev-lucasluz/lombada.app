import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCollection, type CollectionItem } from "../lib/db";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { spineColor } from "../lib/spineColor";
import { useAuth } from "../lib/auth";
import { SpineStrip } from "../components/Shelf";
import "./pages.css";

export function CollectionPage() {
  const { signOut } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ["collection"], queryFn: listCollection });

  const totalOwned = data?.reduce((sum, c) => sum + c.owned.length, 0) ?? 0;

  return (
    <div className="page">
      <header className="page-head">
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
          <button className="btn btn-ghost mobile-only" onClick={signOut}>Sair</button>
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

      {data && data.length > 0 && (
        <ul className="series-list">
          {data.map((item) => (
            <SeriesRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SeriesRow({ item }: { item: CollectionItem }) {
  const { edition } = item;
  const total = edition.total_volumes ?? Math.max(0, ...item.owned);
  const missing = missingVolumes(item.owned, edition.total_volumes);
  const complete = edition.total_volumes !== null && missing.length === 0;

  return (
    <li>
      <Link to={`/colecao/${item.id}`} className="series-row">
        <Cover url={edition.work.cover_url} title={edition.work.title} />
        <div className="series-body">
          <div className="series-title">
            <h2>{edition.work.title}</h2>
            <span className="series-edition">
              {edition.name}
              {edition.publisher ? `, ${edition.publisher}` : ""}
            </span>
          </div>
          <SpineStrip total={total} owned={new Set(item.owned)} color={spineColor(edition.id)} />
          <p className="series-status">
            <span className="num">
              {item.owned.length}
              {edition.total_volumes ? ` de ${edition.total_volumes}` : ""}
            </span>
            {complete ? (
              <span className="tag-complete">Completa</span>
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
