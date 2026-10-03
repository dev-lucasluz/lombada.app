import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listCollection, markWorksAdult, removeFromCollection, type CollectionItem } from "../lib/db";
import { fetchAdultAnilistIds } from "../lib/catalog";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { seriesHue, seriesHues } from "../lib/spineColor";
import { PageCorner } from "../components/PageCorner";
import { nicheClass, SpineStrip } from "../components/Shelf";
import { Icon } from "../components/Icon";
import { Dialog } from "../components/Dialog";
import { Skeleton } from "../components/Skeleton";
import { ShareControls } from "../components/ShareControls";
import { VolumeCount } from "../components/VolumeCount";
import { BookShelf, isStandalone } from "../components/BookShelf";
import { normalizeTitle } from "../lib/quickAdd";
import { groupBookSeries, isInBookSeries, type BookSeries } from "../lib/bookSeries";
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
  const hues = seriesHues(data ?? []);
  const [search, setSearch] = useState("");
  const wanted = normalizeTitle(search);
  const matches = (i: CollectionItem) => !wanted || normalizeTitle(i.edition.work.title).includes(wanted);
  const books = (data?.filter((i) => isStandalone(i) && !isInBookSeries(i)) ?? []).filter(matches);
  const bookSeries = groupBookSeries(data ?? []).filter(
    (g) => !wanted || normalizeTitle(g.name).includes(wanted) || g.books.some(matches),
  );
  // +18 fica escondido até o usuário clicar no botão; a escolha é lembrada neste aparelho.
  // Ordem da estante: mais recentes primeiro (como sempre), A–Z ou as incompletas primeiro; lembrada neste aparelho.
  const [order, setOrder] = useState<ShelfOrder>(() => {
    try {
      const saved = localStorage.getItem("lombada-shelf-order");
      return saved === "az" || saved === "incomplete" ? saved : "recent";
    } catch { return "recent"; }
  });
  const changeOrder = (next: ShelfOrder) => {
    setOrder(next);
    try { localStorage.setItem("lombada-shelf-order", next); } catch { /* sem armazenamento */ }
  };
  const [showAdult, setShowAdult] = useState(() => {
    try { return localStorage.getItem("lombada-show-adult") === "1"; } catch { return false; }
  });
  const toggleAdult = () => {
    setShowAdult((v) => {
      try { localStorage.setItem("lombada-show-adult", v ? "0" : "1"); } catch { /* sem armazenamento */ }
      return !v;
    });
  };
  const allSeries = data?.filter((i) => !isStandalone(i) && !isInBookSeries(i)) ?? [];
  const series = (showAdult ? allSeries : allSeries.filter((i) => !i.edition.work.is_adult)).filter(matches);

  // Séries de mangá e séries de livros na mesma fila, pela atividade mais recente (a lista já vem nessa ordem;
  // a série de livros fica no lugar do livro dela que mudou por último).
  const activity = new Map((data ?? []).map((item, index) => [item.id, index]));
  const rankOf = (e: ShelfEntry) =>
    e.type === "edition" ? (activity.get(e.item.id) ?? 0) : Math.min(...e.group.books.map((b) => activity.get(b.id) ?? 0));
  const entries: ShelfEntry[] = [
    ...series.map((item): ShelfEntry => ({ type: "edition", item })),
    ...bookSeries.map((group): ShelfEntry => ({ type: "group", group })),
  ].sort((x, y) => rankOf(x) - rankOf(y));
  // A ordenação é estável: entre iguais, vale a ordem de atividade.
  const ordered =
    order === "az"
      ? [...entries].sort((x, y) => entryTitle(x).localeCompare(entryTitle(y), "pt"))
      : order === "incomplete"
        ? [...entries].sort((x, y) => Number(isIncomplete(y)) - Number(isIncomplete(x)))
        : entries;

  // Séries bem curtas (2 ou 3 volumes) dividem um bloco: cada uma pega a próxima curta da lista e as duas
  // ficam no lugar da primeira. Em A–Z só se juntam as que já são vizinhas (senão uma série sairia do lugar
  // alfabético). O resto segue a ordem escolhida.
  const tiles: Tile[] = [];
  const paired = new Set<ShelfEntry>();
  ordered.forEach((entry, i) => {
    if (paired.has(entry)) return;
    if (isShortEntry(entry)) {
      const mate = (order === "az" ? ordered.slice(i + 1, i + 2) : ordered.slice(i + 1)).find((e) => isShortEntry(e) && !paired.has(e));
      if (mate && entry.type === "edition" && mate.type === "edition") {
        paired.add(mate);
        tiles.push({ type: "pair", a: entry.item, b: mate.item });
        return;
      }
    }
    tiles.push(entry);
  });
  const hueOf = (item: CollectionItem) => hues.get(item.id) ?? seriesHue(item.edition.id);

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
          <div className="segmented" role="group" aria-label="Ordem da estante">
            <button aria-pressed={order === "recent"} onClick={() => changeOrder("recent")}>Recentes</button>
            <button aria-pressed={order === "az"} onClick={() => changeOrder("az")}>A–Z</button>
            <button aria-pressed={order === "incomplete"} onClick={() => changeOrder("incomplete")}>Incompletas</button>
          </div>
          {allSeries.length > 0 && (
            <div className="segmented" role="group" aria-label="Conteúdo +18">
              <button aria-pressed={showAdult} onClick={toggleAdult}>
                {showAdult ? "Esconder +18" : "Mostrar +18"}
              </button>
            </div>
          )}
        </div>
      )}

      {data && data.length > 0 && wanted && series.length === 0 && books.length === 0 && bookSeries.length === 0 && (
        <p className="muted">
          Nenhuma obra com “{search.trim()}” na coleção. <button type="button" className="btn-text" onClick={() => setSearch("")}>Limpar busca</button>
        </p>
      )}

      {data && data.length > 0 && (
        <ul className="series-list is-cols">
          {tiles.map((tile) =>
            tile.type === "pair" ? (
              <li key={`${tile.a.id}+${tile.b.id}`} className="pair-tile">
                <ShortSeriesCell item={tile.a} hue={hueOf(tile.a)} />
                <ShortSeriesCell item={tile.b} hue={hueOf(tile.b)} />
              </li>
            ) : tile.type === "edition" ? (
              <SeriesRow key={tile.item.id} item={tile.item} hue={hueOf(tile.item)} />
            ) : (
              <BookSeriesRow key={tile.group.key} group={tile.group} hue={seriesHue(`serie:${tile.group.key}`)} />
            ),
          )}
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

type ShelfEntry = { type: "edition"; item: CollectionItem } | { type: "group"; group: BookSeries };
type ShelfOrder = "recent" | "az" | "incomplete";
type Tile = ShelfEntry | { type: "pair"; a: CollectionItem; b: CollectionItem };

/** Série de 2 ou 3 volumes: cabe em meia largura. */
function isShortEntry(e: ShelfEntry) {
  if (e.type !== "edition") return false;
  const total = seriesTotal(e.item);
  return total >= 2 && total <= 3;
}

const entryTitle = (e: ShelfEntry) => (e.type === "edition" ? e.item.edition.work.title : e.group.name);

/** Falta algum volume: total conhecido e ainda não completo. */
function isIncomplete(e: ShelfEntry) {
  if (e.type === "group") return e.group.owned.filter((n) => n <= e.group.total).length < e.group.total;
  return missingVolumes(e.item.owned, e.item.edition.total_volumes).length > 0;
}

function seriesTotal(item: CollectionItem) {
  return item.edition.total_volumes ?? Math.max(0, ...item.owned);
}

/** Metade de um bloco duplo: série de 2 ou 3 volumes, com capa pequena, nome, contador, lombadas e status. */
function ShortSeriesCell({ item, hue }: { item: CollectionItem; hue: number }) {
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
    <div className="pair-cell">
      <Link to={`/colecao/${item.id}`} className="pair-link" aria-label={`Abrir ${edition.work.title}`} />
      <Cover url={edition.work.cover_url} title={edition.work.title} />
      <h2>{edition.work.title}{edition.work.is_adult && <span className="badge-adult">+18</span>}</h2>
      <VolumeCount owned={item.owned.length} total={edition.total_volumes} />
      <SpineStrip total={total} owned={new Set(item.owned)} hue={hue} numberGaps />
      <p className="series-status">
        {complete ? (
          <span className="series-missing">Coleção completa</span>
        ) : missing.length > 0 ? (
          <span className="series-missing is-gap">Faltam {formatRanges(missing)}</span>
        ) : (
          <span className="muted">Total não informado</span>
        )}
      </p>
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
    </div>
  );
}

function SeriesRow({ item, hue }: { item: CollectionItem; hue: number }) {
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
    <li className={nicheClass(total) ? `${nicheClass(total)} has-remove` : "has-remove"}>
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
          <SpineStrip total={total} owned={new Set(item.owned)} hue={hue} numberGaps />
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

/** Série de livros com títulos diferentes: uma faixa de lombadas com os livros que a pessoa tem e os vãos do resto. */
function BookSeriesRow({ group, hue }: { group: BookSeries; hue: number }) {
  const owned = new Set(group.owned);
  const missing = Array.from({ length: group.total }, (_, i) => i + 1).filter((n) => !owned.has(n));
  const complete = missing.length === 0 && group.owned.length > 0;
  const first = group.books[0];
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => Promise.all(group.books.map((b) => removeFromCollection(b.id))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collection"] }),
  });

  return (
    <li className={nicheClass(group.total) ? `${nicheClass(group.total)} has-remove` : "has-remove"}>
      <div className="series-row is-group">
        {/* O card inteiro abre a série (a página do primeiro livro mostra todos); cada livro tem o seu atalho por cima */}
        <Link to={`/colecao/${first.id}`} className="series-row-link" aria-label={`Abrir a série ${group.name}`} />
        <Cover url={first.edition.work.cover_url} title={group.name} />
        <div className="series-body">
          <div className="series-title">
            <div className="series-name">
              <h2>{group.name}</h2>
              <span className="series-edition">Série de livros</span>
            </div>
            <VolumeCount owned={group.books.length} total={group.total} />
          </div>
          <SpineStrip total={group.total} owned={owned} hue={hue} numberGaps />
          <p className="series-status">
            {complete ? (
              <span className="series-missing">Série completa</span>
            ) : (
              <span className="series-missing is-gap">
                {missing.length === 1 ? "Falta o livro" : "Faltam os livros"} {formatRanges(missing)}
              </span>
            )}
          </p>
          <ul className="series-books">
            {group.books.map((b) => (
              <li key={b.id}>
                <Link to={`/colecao/${b.id}`}>
                  <span className="num">{b.edition.series_number ?? "?"}</span> {b.edition.work.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button
        type="button"
        className="series-remove"
        aria-label={`Remover a série ${group.name} da coleção`}
        title="Remover a série da coleção"
        disabled={remove.isPending}
        onClick={() => {
          const n = group.books.length;
          if (confirm(`Remover a série ${group.name} e ${n === 1 ? "o livro" : `os ${n} livros`} da sua coleção?`)) remove.mutate();
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
