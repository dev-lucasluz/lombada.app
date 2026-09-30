import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCollection } from "../lib/db";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { Icon } from "../components/Icon";
import "./pages.css";

/** Tudo o que falta, série por série — pensado para abrir na loja. */
export function ShoppingPage() {
  const { data, isLoading } = useQuery({ queryKey: ["collection"], queryFn: listCollection });

  const rows = (data ?? [])
    .filter((c) => c.edition.total_volumes !== null)
    .map((c) => ({ item: c, missing: missingVolumes(c.owned, c.edition.total_volumes) }))
    .filter((r) => r.missing.length > 0)
    .sort((a, b) => a.item.edition.work.title.localeCompare(b.item.edition.work.title));

  const totalMissing = rows.reduce((sum, r) => sum + r.missing.length, 0);

  return (
    <div className="page">
      <Link to="/" className="back-link"><Icon name="back" size={18} /> Coleção</Link>
      <header className="page-head">
        <div>
          <h1>Lista de compras</h1>
          {rows.length > 0 && (
            <p><span className="num">{totalMissing}</span> volumes faltando em <span className="num">{rows.length}</span> séries</p>
          )}
        </div>
      </header>

      {isLoading && <p className="muted">Carregando…</p>}
      {data && rows.length === 0 && (
        <div className="empty">
          <h2>Nada para comprar</h2>
          <p>Todas as séries com total de volumes informado estão completas.</p>
        </div>
      )}

      <ul className="reading-list">
        {rows.map(({ item, missing }) => (
          <li key={item.id}>
            <Link to={`/colecao/${item.id}`} className="reminder-row" style={{ color: "inherit", textDecoration: "none" }}>
              <div className="reminder-body">
                <h2 style={{ fontSize: "var(--step-1)" }}>{item.edition.work.title}</h2>
                <span className="hint">{item.edition.name}{item.edition.publisher ? `, ${item.edition.publisher}` : ""}</span>
                <span style={{ fontWeight: 600 }}>{formatRanges(missing)}</span>
              </div>
              <span className="num" style={{ fontSize: "var(--step-3)" }}>{missing.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
