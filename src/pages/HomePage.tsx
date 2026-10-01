import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import {
  listCollection,
  listReading,
  listReminders,
  READING_STATUS_LABEL,
  saveReading,
  type ReadingEntry,
} from "../lib/db";
import { formatRanges, missingVolumes } from "../lib/ranges";
import { seriesHue, seriesHues } from "../lib/spineColor";
import { nicheClass, seriesUnits, SpineStrip } from "../components/Shelf";
import { packShelf } from "../lib/packShelf";
import { Icon } from "../components/Icon";
import { VolumeCount } from "../components/VolumeCount";
import { BookShelf, isStandalone } from "../components/BookShelf";
import { useColumns } from "../lib/useColumns";
import { PageCorner } from "../components/PageCorner";
import { Cover } from "./CollectionPage";
import { editionLabel } from "../lib/editionLabel";
import "./pages.css";
import "./HomePage.css";

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "short" });

function formatChapter(n: number | null) {
  return n === null ? "–" : Number(n).toLocaleString("pt-BR");
}

export function HomePage() {
  const { session } = useAuth();
  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });
  const reading = useQuery({ queryKey: ["reading"], queryFn: listReading });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: listReminders });

  const fullName = (session?.user.user_metadata?.full_name as string | undefined) ?? "";
  const rawFirst = fullName.trim().split(" ")[0] ?? "";
  const firstName = rawFirst ? rawFirst[0].toLocaleUpperCase("pt-BR") + rawFirst.slice(1) : "";
  const totalOwned = collection.data?.reduce((sum, c) => sum + c.owned.length, 0) ?? 0;
  const seriesCount = collection.data?.length ?? 0;

  return (
    <div className="page home">
      <header className="page-head">
        <div>
          <h1>{firstName ? `Olá, ${firstName}` : "Olá"}</h1>
          {collection.data && (
            <p>
              {seriesCount === 0
                ? "Comece adicionando a primeira série da sua estante."
                : `${totalOwned} ${totalOwned === 1 ? "volume" : "volumes"} em ${seriesCount} ${seriesCount === 1 ? "série" : "séries"}.`}
            </p>
          )}
        </div>
        <div className="head-actions">
          <Link to="/adicionar" className="btn btn-primary">
            <Icon name="plus" size={20} /> Adicionar série
          </Link>
          {/* Cadastro rápido logo ao lado: foto da estante ou voz */}
          <Link to="/foto-e-voz" className="btn btn-accent btn-sub">
            <Icon name="camera" size={22} />
            <span>
              <strong>Enviar foto</strong>
              <small>Fotografe a estante e preencha automaticamente</small>
            </span>
          </Link>
          <Link to="/foto-e-voz?modo=voz" className="btn btn-accent btn-sub">
            <Icon name="mic" size={22} />
            <span>
              <strong>Falar volumes</strong>
              <small>Diga o que você tem e o app anota</small>
            </span>
          </Link>
        </div>
        <PageCorner />
      </header>

      <div className="home-grid">
        <CollectionBlock data={collection.data} />
        <ReadingBlock data={reading.data} />
        <RemindersBlock data={reminders.data} />
        <ShoppingBlock data={collection.data} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BlockHead({ title, subtitle, to, linkLabel }: { title: string; subtitle?: string; to: string; linkLabel: string }) {
  return (
    <div className="block-head">
      <h2>
        {title}
        {subtitle && <span className="block-subtitle">{subtitle}</span>}
      </h2>
      <Link to={to} className="block-link">{linkLabel}</Link>
    </div>
  );
}

function CollectionBlock({ data }: { data: Awaited<ReturnType<typeof listCollection>> | undefined }) {
  const cols = useColumns([[1600, 4], [1180, 3], [700, 2]]);
  // Livros avulsos (1 volume) vão para uma prateleira de capas; séries ficam nos nichos
  const hues = seriesHues(data ?? []);
  const books = data?.filter(isStandalone) ?? [];
  const series = data?.filter((i) => !isStandalone(i)) ?? [];
  // Duas linhas cheias de séries curtas em qualquer largura
  const recent = series.slice(0, cols * 2);

  // Arruma as séries em linhas completas. Se alguma série foi esticada em 2+
  // meias-colunas só para fechar a linha, o nicho de livros avulsos ocupa essa
  // sobra no lugar dela (a maior sobra, de preferência a mais embaixo).
  const { placed: shelf, fillerPlaced: booksPlaced } = packShelf(
    recent,
    (i) => seriesUnits(i.edition.total_volumes ?? Math.max(0, ...i.owned)),
    cols * 2,
    { reserveFiller: books.length > 0 },
  );

  const booksNiche = (span: number) => (
    <li className="home-books" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <div className="home-books-head">
        <strong>Livros avulsos</strong>
        <span className="hint">{books.length}</span>
      </div>
      <BookShelf items={books.slice(0, 12)} compact />
    </li>
  );

  return (
    <section className="block block-collection">
      <BlockHead title="Coleção" subtitle="Últimas adições" to="/colecao" linkLabel="Ver coleção" />
      {data && data.length === 0 && (
        <div className="block-empty">
          <p>Busque um mangá ou livro, escolha a edição e marque os volumes que você tem.</p>
          <Link to="/adicionar" className="btn btn-ghost">Adicionar a primeira série</Link>
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="home-series">
          {shelf.map(({ item, span, fillerAfter: booksAfter }) => {
            const { edition } = item;
            const total = edition.total_volumes ?? Math.max(0, ...item.owned);
            return (
              <Fragment key={item.id}>
              <li className={nicheClass(total)} style={{ gridColumn: `span ${span}` }}>
                <Link to={`/colecao/${item.id}`} className="home-series-item">
                  <Cover url={edition.work.cover_url} title={edition.work.title} />
                  <div className="home-series-body">
                    <div className="home-series-head">
                      <strong>{edition.work.title}</strong>
                      <VolumeCount owned={item.owned.length} total={edition.total_volumes} />
                    </div>
                    {editionLabel(edition, edition.work.title) && (
                      <span className="hint">{editionLabel(edition, edition.work.title)}</span>
                    )}
                    <SpineStrip total={total} owned={new Set(item.owned)} hue={hues.get(item.id) ?? seriesHue(edition.id)} />
                  </div>
                </Link>
              </li>
              {booksAfter > 0 && booksNiche(booksAfter)}
              </Fragment>
            );
          })}
          {books.length > 0 && !booksPlaced && booksNiche(0)}
        </ul>
      )}
    </section>
  );
}

function ReadingBlock({ data }: { data: ReadingEntry[] | undefined }) {
  const qc = useQueryClient();
  const bump = useMutation({
    mutationFn: (e: ReadingEntry) =>
      saveReading({ id: e.id, title: e.title, last_chapter: (Number(e.last_chapter) || 0) + 1, last_read_at: new Date().toISOString() }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["reading"] }),
  });
  const recent = data?.slice(0, 3) ?? [];

  return (
    <section className="block block-reading">
      <BlockHead title="Onde parei" to="/onde-parei" linkLabel="Ver tudo" />
      {data && recent.length === 0 && (
        <div className="block-empty">
          <p>Anote o capítulo em que parou nos mangás que você lê em outros sites.</p>
          <Link to="/onde-parei" className="btn btn-ghost">Anotar onde parei</Link>
        </div>
      )}
      <ul className="home-reading">
        {recent.map((e) => (
          <li key={e.id}>
            <div className="home-reading-info">
              <strong>{e.title}</strong>
              <span className="status-pill" data-status={e.status}>{READING_STATUS_LABEL[e.status]}</span>
            </div>
            <div className="home-reading-chapter">
              <span className="num">{formatChapter(e.last_chapter)}</span>
              <button
                className="btn btn-ghost btn-s"
                onClick={() => bump.mutate(e)}
                disabled={bump.isPending}
                aria-label={`Li mais um capítulo de ${e.title}`}
              >
                +1
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RemindersBlock({ data }: { data: Awaited<ReturnType<typeof listReminders>> | undefined }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data ?? []).filter((r) => !r.sent_at || r.remind_on >= today).slice(0, 3);

  return (
    <section className="block block-reminders">
      <BlockHead title="Lembretes" to="/lembretes" linkLabel="Ver tudo" />
      {data && upcoming.length === 0 && (
        <div className="block-empty">
          <p>Mangá em hiato com data para voltar? Crie um lembrete para o dia.</p>
          <Link to="/lembretes" className="btn btn-ghost">Criar lembrete</Link>
        </div>
      )}
      <ul className="home-reminders">
        {upcoming.map((r) => {
          const d = new Date(`${r.remind_on}T12:00:00`);
          const due = r.remind_on <= today;
          return (
            <li key={r.id} className={due ? "is-due" : undefined}>
              <span className="home-date">
                <span className="num">{d.getDate()}</span>
                <small>{monthFmt.format(d).replace(".", "")}</small>
              </span>
              <span className="home-reminder-text">
                <strong>{r.message}</strong>
                {due && <span className="hint">É hoje</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShoppingBlock({ data }: { data: Awaited<ReturnType<typeof listCollection>> | undefined }) {
  const rows = (data ?? [])
    .filter((c) => c.edition.total_volumes !== null)
    .map((c) => ({ item: c, missing: missingVolumes(c.owned, c.edition.total_volumes) }))
    .filter((r) => r.missing.length > 0)
    .sort((a, b) => b.missing.length - a.missing.length);
  const total = rows.reduce((sum, r) => sum + r.missing.length, 0);

  return (
    <section className="block block-shopping">
      <BlockHead title="Lista de compras" to="/compras" linkLabel="Ver lista" />
      {data && rows.length === 0 ? (
        <div className="block-empty">
          <p>
            {data.length === 0
              ? "Os volumes que faltam nas suas séries aparecem aqui."
              : "Nenhum volume faltando nas séries com total informado."}
          </p>
        </div>
      ) : (
        <>
          <p className="home-shopping-total">
            <mark className="num">{total}</mark> {total === 1 ? "volume faltando" : "volumes faltando"}
          </p>
          <ul className="home-shopping">
            {rows.slice(0, 3).map(({ item, missing }) => (
              <li key={item.id}>
                <strong>{item.edition.work.title}</strong>
                <span className="hint">{formatRanges(missing)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
