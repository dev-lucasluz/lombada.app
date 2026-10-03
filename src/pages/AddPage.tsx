import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchBooks, searchManga, type CatalogResult } from "../lib/catalog";
import { addToCollection, createEdition, createManualWork, ensureWork, listEditions, setVolumesOwned, type Edition, type Work } from "../lib/db";
import { prepareCover, prepareImage, scanCoverPhoto } from "../lib/quickAdd";
import { isDemo } from "../lib/demo";
import { Icon } from "../components/Icon";
import { Dialog } from "../components/Dialog";
import { EMPTY_SERIES, SeriesFields, seriesPatch, type SeriesForm } from "../components/SeriesFields";
import { quotaText, useScanQuota } from "../lib/useScanQuota";
import { Cover } from "./CollectionPage";
import "./pages.css";

type Kind = "manga" | "book";

export function AddPage() {
  const [kind, setKind] = useState<Kind>("manga");
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  // +18 fica escondido até clicar no botão; a escolha é lembrada neste aparelho (mesma da Coleção).
  const [showAdult, setShowAdult] = useState(() => {
    try { return localStorage.getItem("lombada-show-adult") === "1"; } catch { return false; }
  });
  const toggleAdult = () => {
    setShowAdult((v) => {
      try { localStorage.setItem("lombada-show-adult", v ? "0" : "1"); } catch { /* sem armazenamento */ }
      return !v;
    });
  };
  const [work, setWork] = useState<{ work: Work; result: CatalogResult } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const qc = useQueryClient();
  const quota = useScanQuota();

  // Busca enquanto digita: espera uma pausa de 400 ms para não consultar a cada letra.
  useEffect(() => {
    const next = term.trim();
    const timer = setTimeout(() => setSubmitted(next), 400);
    return () => clearTimeout(timer);
  }, [term]);

  const search = useQuery({
    queryKey: ["catalog", kind, submitted, showAdult],
    queryFn: () => (kind === "manga" ? searchManga(submitted, showAdult) : searchBooks(submitted)),
    enabled: submitted.length >= 2,
    staleTime: 5 * 60_000,
    // Mantém os resultados anteriores na tela enquanto a nova busca chega.
    placeholderData: keepPreviousData,
  });

  const pick = useMutation({
    mutationFn: async (result: CatalogResult) => ({ work: await ensureWork(result), result }),
    onSuccess: setWork,
  });

  // Foto da capa: a IA lê título e autor e a busca abaixo é preenchida sozinha.
  const [coverState, setCoverState] = useState<"idle" | "reading">("idle");
  const [coverError, setCoverError] = useState<string | null>(null);
  const onCover = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverError(null);
    setCoverState("reading");
    try {
      const read = await scanCoverPhoto(await prepareImage(file));
      if (!read.found) {
        setCoverError("Não conseguimos ler o título nessa capa. Tente de frente, com boa luz e a capa inteira na foto.");
      } else {
        setKind(read.kind);
        // Para livros, o autor ajuda a achar a edição certa; no AniList só o título funciona bem.
        const next = read.kind === "book" && read.author ? `${read.title} ${read.author}` : read.title;
        setTerm(next);
        setSubmitted(next.trim());
      }
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "A leitura da capa falhou.");
    } finally {
      setCoverState("idle");
      qc.invalidateQueries({ queryKey: ["scan-quota"] });
    }
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(term.trim());
  };

  if (work) return <ChooseEdition work={work.work} result={work.result} onBack={() => setWork(null)} />;

  const startManual = (created: Work) => {
    setManualOpen(false);
    setWork({
      work: created,
      result: {
        source: created.kind === "manga" ? "anilist" : "open_library",
        externalId: "",
        kind: created.kind,
        title: created.title,
        originalTitle: null,
        authors: created.authors,
        coverUrl: created.cover_url,
        coverColor: null,
        volumes: null,
        status: null,
        year: null,
      },
    });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Adicionar série</h1>
          <p>Busque pelo nome. Depois você escolhe a edição que tem em casa.</p>
        </div>
      </header>

      <div className="head-actions">
        <div className="segmented" role="group" aria-label="Tipo">
          <button aria-pressed={kind === "manga"} onClick={() => setKind("manga")}>Mangá</button>
          <button aria-pressed={kind === "book"} onClick={() => setKind("book")}>Livro</button>
        </div>
        {kind === "manga" && (
          <div className="segmented" role="group" aria-label="Conteúdo +18">
            <button aria-pressed={showAdult} onClick={toggleAdult}>
              {showAdult ? "Esconder +18" : "Mostrar +18"}
            </button>
          </div>
        )}
      </div>

      <form className="search-bar" onSubmit={onSearch} role="search">
        <label htmlFor="q" className="visually-hidden">Nome da obra</label>
        <input
          id="q"
          className="input"
          placeholder={kind === "manga" ? "Ex.: Naruto" : "Ex.: O Hobbit"}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
        />
        <button className="btn btn-primary" type="submit" aria-label="Buscar">
          <Icon name="search" size={20} />
        </button>
      </form>

      <div className="cover-scan">
        {!isDemo && (
          <>
            <label className={coverState === "reading" ? "btn btn-ghost is-busy" : "btn btn-ghost"}>
              <Icon name="camera" size={18} />
              {coverState === "reading" ? "Lendo a capa…" : "Fotografar a capa"}
              <input type="file" accept="image/*" capture="environment" onChange={onCover} disabled={coverState === "reading" || quota.left === 0} className="visually-hidden" />
            </label>
            {coverState !== "reading" && (
              <label className="btn btn-ghost">
                <Icon name="image" size={18} />
                Capa da galeria
                <input type="file" accept="image/*" onChange={onCover} disabled={quota.left === 0} className="visually-hidden" />
              </label>
            )}
          </>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => setManualOpen(true)}>
          <Icon name="plus" size={18} /> Adicionar manualmente
        </button>
        {coverState === "reading" && <span className="hint" role="status">Leva alguns segundos.</span>}
      </div>
      {!isDemo && quotaText(quota.left, quota.limit) && <p className="hint">{quotaText(quota.left, quota.limit)}</p>}
      {coverError && <p className="error" role="alert">{coverError}</p>}

      {search.isFetching && !search.data && <p className="muted">Buscando…</p>}
      {search.error && <p className="error" role="alert">{(search.error as Error).message}</p>}
      {pick.error && <p className="error" role="alert">{(pick.error as Error).message}</p>}
      {submitted.length >= 2 && search.data && search.data.length === 0 && !search.isFetching && (
        <p className="muted">
          Nada encontrado para “{submitted}”. Tente o nome em inglês ou romaji, ou{" "}
          <button type="button" className="btn-text" onClick={() => setManualOpen(true)}>adicione manualmente</button>.
        </p>
      )}

      {submitted.length >= 2 && search.data && search.data.length > 0 && (
        <ul className={search.isPlaceholderData ? "results is-stale" : "results"}>
          {search.data.map((r) => (
            <li key={r.externalId}>
              <button className="result" onClick={() => pick.mutate(r)} disabled={pick.isPending}>
                <Cover url={r.coverUrl} title={r.title} />
                <div>
                  <h3>{r.title}{r.isAdult && <span className="badge-adult">+18</span>}</h3>
                  <p className="result-meta">
                    {[r.authors.slice(0, 2).join(", "), r.year, r.kind === "manga" && r.volumes ? `${r.volumes} volumes no Japão` : null, r.status]
                      .filter(Boolean)
                      .join(". ")}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {manualOpen && (
        <ManualWorkDialog initialKind={kind} initialTitle={term.trim()} onClose={() => setManualOpen(false)} onCreated={startManual} />
      )}
    </div>
  );
}

/** Cadastro à mão: para quando a obra não aparece nos catálogos. O restante (edição e total) vem na tela seguinte. */
function ManualWorkDialog({
  initialKind,
  initialTitle,
  onClose,
  onCreated,
}: {
  initialKind: Kind;
  initialTitle: string;
  onClose: () => void;
  onCreated: (work: Work) => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState("");
  // Capa opcional, já reduzida e convertida para JPEG (data URL).
  const [cover, setCover] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const onPickCover = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverError(null);
    setPreparing(true);
    try {
      setCover(await prepareCover(file));
    } catch (err) {
      setCover(null);
      setCoverError(err instanceof Error ? err.message : "Não foi possível usar essa imagem.");
    } finally {
      setPreparing(false);
    }
  };
  const create = useMutation({
    mutationFn: () =>
      createManualWork({
        kind,
        title: title.trim().slice(0, 200),
        authors: author.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 5),
        coverUrl: cover,
      }),
    onSuccess: onCreated,
  });

  return (
    <Dialog titleId="manual-title" onClose={onClose}>
      <h2 id="manual-title">Adicionar manualmente</h2>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <p className="hint">
          Use quando não achar a obra pelo nome ou quando ela não estiver nos catálogos. Na próxima tela você informa a
          edição e o total de volumes.
        </p>
        <div className="segmented" role="group" aria-label="Tipo">
          <button type="button" aria-pressed={kind === "manga"} onClick={() => setKind("manga")}>Mangá</button>
          <button type="button" aria-pressed={kind === "book"} onClick={() => setKind("book")}>Livro</button>
        </div>
        <div className="field">
          <label htmlFor="manual-name">Título</label>
          <input
            id="manual-name"
            data-autofocus
            className="input"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "manga" ? "Ex.: Diário de uma Apotecária" : "Ex.: O Hobbit"}
          />
        </div>
        <div className="field">
          <label htmlFor="manual-author">Autor (opcional)</label>
          <input
            id="manual-author"
            className="input"
            maxLength={200}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Para mais de um, separe por vírgula"
          />
        </div>
        <div className="feedback-attach">
          {cover ? (
            <div className="feedback-thumb">
              <img src={cover} alt="Capa escolhida" style={{ maxHeight: 96 }} />
              <button type="button" className="btn btn-ghost" onClick={() => setCover(null)}>Remover capa</button>
            </div>
          ) : (
            <label className={preparing ? "btn btn-ghost is-busy" : "btn btn-ghost"}>
              <Icon name="camera" size={18} />
              {preparing ? "Preparando a capa…" : "Foto da capa (opcional)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickCover} disabled={preparing} className="visually-hidden" />
            </label>
          )}
          <small className="hint">A capa aparece na sua estante e só fica visível para você e para quem receber o seu link.</small>
        </div>
        {coverError && <p className="error" role="alert">{coverError}</p>}
        {create.error && <p className="error" role="alert">{(create.error as Error).message}</p>}
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={create.isPending || preparing || title.trim().length < 1}>
            {create.isPending ? "Criando…" : "Continuar"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Dialog>
  );
}

function ChooseEdition({ work, result, onBack }: { work: Work; result: CatalogResult; onBack: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editions = useQuery({ queryKey: ["editions", work.id], queryFn: () => listEditions(work.id) });
  const [form, setForm] = useState({
    name: work.kind === "book" ? "Edição brasileira" : work.title,
    publisher: "",
    total: result.volumes?.toString() ?? "",
  });
  const [haveAll, setHaveAll] = useState(false);
  const [series, setSeries] = useState<SeriesForm>(EMPTY_SERIES);

  const add = useMutation({
    mutationFn: async (existing?: Edition) => {
      const edition =
        existing ??
        (await createEdition({
          work_id: work.id,
          name: form.name.trim() || work.title,
          publisher: form.publisher.trim() || null,
          total_volumes: work.kind === "book" && series.inSeries ? 1 : form.total ? Number(form.total) : null,
          is_finished: false,
          ...(work.kind === "book" && series.inSeries ? seriesPatch(series) : {}),
        }));
      const collectionId = await addToCollection(edition.id);
      // "Já tenho todos": marca de 1 até o total da edição (se ela informar o total).
      if (haveAll && edition.total_volumes) {
        await setVolumesOwned(collectionId, Array.from({ length: edition.total_volumes }, (_, i) => i + 1), true);
      }
      return collectionId;
    },
    onSuccess: (collectionId) => {
      qc.invalidateQueries({ queryKey: ["collection"] });
      navigate(`/colecao/${collectionId}`);
    },
  });

  return (
    <div className="page">
      <button className="back-link" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={onBack}>
        <Icon name="back" size={18} /> Voltar para a busca
      </button>

      <header className="edition-head">
        <Cover url={work.cover_url} title={work.title} size="l" />
        <div className="edition-meta">
          <h1>{work.title}</h1>
          <span>Qual edição você tem?</span>
        </div>
      </header>

      <label className="check-row">
        <input type="checkbox" checked={haveAll} onChange={(e) => setHaveAll(e.target.checked)} />
        <span>
          Já tenho todos os volumes
          <small className="hint"> Marca todos de uma vez ao adicionar (precisa do total de volumes da edição).</small>
        </span>
      </label>

      {editions.data && editions.data.length > 0 && (
        <section className="panel">
          <h2>Edições cadastradas</h2>
          <ul className="results">
            {editions.data.map((ed) => (
              <li key={ed.id}>
                <button className="result" onClick={() => add.mutate(ed)} disabled={add.isPending}>
                  <div>
                    <h3>{ed.name}</h3>
                    <p className="result-meta">
                      {[ed.publisher, ed.total_volumes ? `${ed.total_volumes} volumes` : "Total não informado"]
                        .filter(Boolean)
                        .join(". ")}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(undefined);
        }}
      >
        <h2>{editions.data?.length ? "Não achou a sua? Cadastre a edição" : "Cadastre a edição"}</h2>
        <p className="hint">
          O total pode ser diferente do japonês: edições como a Gold ou a 3 em 1 têm outra numeração.
          Se ainda estiver saindo, deixe em branco ou coloque o total atual.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="new-name">Nome da edição</label>
            <input id="new-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="new-pub">Editora</label>
            <input id="new-pub" className="input" placeholder="Ex.: Panini, JBC, NewPOP" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
          </div>
          {!(work.kind === "book" && series.inSeries) && (
            <div className="field">
              <label htmlFor="new-total">Total de volumes</label>
              <input id="new-total" className="input" type="number" min={1} max={999} inputMode="numeric" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </div>
          )}
        </div>
        {work.kind === "book" && <SeriesFields idPrefix="new" value={series} onChange={setSeries} />}
        <button className="btn btn-primary" type="submit" disabled={add.isPending} style={{ justifySelf: "start" }}>
          Adicionar à coleção
        </button>
        {add.error && <p className="error" role="alert">{(add.error as Error).message}</p>}
      </form>
    </div>
  );
}
