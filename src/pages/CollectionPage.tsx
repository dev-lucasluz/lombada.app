import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCollection, markWorksAdult, removeFromCollection, type CollectionItem } from "../lib/db";
import { fetchAdultAnilistIds } from "../lib/catalog";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { seriesHue, seriesHues } from "../lib/spineColor";
import { PageCorner } from "../components/PageCorner";
import { nicheClass, seriesUnits, SpineStrip } from "../components/Shelf";
import { packShelf } from "../lib/packShelf";
import { useColumns } from "../lib/useColumns";
import { Icon } from "../components/Icon";
import { Dialog } from "../components/Dialog";
import { Skeleton } from "../components/Skeleton";
import { ShareControls } from "../components/ShareControls";
import { VolumeCount } from "../components/VolumeCount";
import { BookShelf, isStandalone } from "../components/BookShelf";
import { normalizeTitle } from "../lib/quickAdd";
import { editionLabel } from "../lib/editionLabel";
import "./pages.css";

export function CollectionPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["collection"], queryFn: listCollection });

  const qc = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);

  // Uma vez por aparelho: marca como +18 as séries adicionadas antes desse recurso existir.
  useEffect(() => {
    if (!data) return;
    try { if (localStorage.getItem("lombada-adult-sync") === "1") return; } catch { /* segue */ }
    const ids = [...new Set(data.map((i) => i.edition.work.anilist_id).filter((v): v is number => v !== null))];
    fetchAdultAnilistIds(ids)
      .then(async (adult) => {
        await markWorksAdult(adult);
        try { localStorage.setItem("lombada-adult-sync", "1"); } catch { /* ok */ }
        if (adult.length > 0) qc.invalidateQueries({ queryKey: ["collection"] });
      })
      .catch(() => {});
  }, [data, qc]);

  const totalOwned = data?.reduce((sum, c) => sum + c.owned.length, 0) ?? 0;
  const cols = useColumns([[1400, 3], [900, 2]]);
  const hues = seriesHues(data ?? []);
  const [search, setSearch] = useState("");
  const wanted = normalizeTitle(search);
  const matches = (i: CollectionItem) => !wanted || normalizeTitle(i.edition.work.title).includes(wanted);
  const books = (data?.filter(isStandalone) ?? []).filter(matches);
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
  const series = (showAdult ? allSeries : allSeries.filter((i) => !i.edition.work.is_adult)).filter(matches);

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
          {data && data.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setShareOpen(true)}>
              <Icon name="share" size={18} /> Compartilhar
            </button>
          )}
          <Link to="/foto-e-voz" className="btn btn-ghost">Adicionar por foto ou voz</Link>
          <Link to="/adicionar" className="btn btn-primary">Adicionar série</Link>
        </div>
      </header>

      {shareOpen && (
        <Dialog titleId="share-title" onClose={() => setShareOpen(false)}>
          <h2 id="share-title">Compartilhar minha estante</h2>
          <div className="dialog-form">
            <ShareControls />
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShareOpen(false)}>Fechar</button>
          </div>
        </Dialog>
      )}

      {isLoading && <Skeleton rows={3} title={false} />}
      {error && <p className="error" role="alert">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="empty">
          <h2>Sua estante está vazia</h2>
          <p>Comece pelo jeito mais fácil para você:</p>
          <ul className="start-ways">
            <li>
              <Link to="/foto-e-voz">
                <Icon name="camera" size={22} />
                <strong>Foto da estante</strong>
                <span>Fotografe uma prateleira e a IA lista as lombadas.</span>
              </Link>
            </li>
            <li>
              <Link to="/foto-e-voz?modo=voz">
                <Icon name="mic" size={22} />
                <strong>Falar os volumes</strong>
                <span>Diga, por exemplo: “tenho Naruto do 1 ao 10”.</span>
              </Link>
            </li>
            <li>
              <Link to="/adicionar">
                <Icon name="search" size={22} />
                <strong>Buscar pelo nome</strong>
                <span>Mangá ou livro, e depois escolha a edição que tem em casa.</span>
              </Link>
            </li>
          </ul>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="collection-tools">
          <input
            className="input"
            type="search"
            placeholder="Buscar na coleção"
            aria-label="Buscar na coleção pelo nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {allSeries.length > 0 && (
            <div className="segmented" role="group" aria-label="Conteúdo +18">
              <button aria-pressed={showAdult} onClick={toggleAdult}>
                {showAdult ? "Esconder +18" : "Mostrar +18"}
              </button>
            </div>
          )}
        </div>
      )}

      {data && data.length > 0 && wanted && series.length === 0 && books.length === 0 && (
        <p className="muted">
          Nenhuma obra com “{search.trim()}” na coleção. <button type="button" className="btn-text" onClick={() => setSearch("")}>Limpar busca</button>
        </p>
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
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeFromCollection(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collection"] }),
  });
  const label = editionLabel(edition, edition.work.title);

  return (
    <li className={`${nicheClass(total)} has-remove`} style={{ gridColumn: `span ${span}` }}>
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
      <button
        type="button"
        className="series-remove"
        aria-label={`Remover ${edition.work.title} da coleção`}
        title="Remover da coleção"
        disabled={remove.isPending}
        onClick={() => {
          if (confirm(`Remover ${edition.work.title}${label ? ` (${label})` : ""} da sua coleção? Os volumes marcados serão apagados.`)) remove.mutate();
        }}
      >
        <Icon name="trash" size={18} />
      </button>
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
