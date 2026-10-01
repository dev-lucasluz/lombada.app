import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchBooks, searchManga, type CatalogResult } from "../lib/catalog";
import { addToCollection, createEdition, ensureWork, listEditions, setVolumesOwned, type Edition, type Work } from "../lib/db";
import { Icon } from "../components/Icon";
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

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(term.trim());
  };

  if (work) return <ChooseEdition work={work.work} result={work.result} onBack={() => setWork(null)} />;

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

      {search.isFetching && !search.data && <p className="muted">Buscando…</p>}
      {search.error && <p className="error" role="alert">{(search.error as Error).message}</p>}
      {pick.error && <p className="error" role="alert">{(pick.error as Error).message}</p>}
      {submitted.length >= 2 && search.data && search.data.length === 0 && !search.isFetching && (
        <p className="muted">Nada encontrado para “{submitted}”. Tente o nome em inglês ou romaji.</p>
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
    </div>
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

  const add = useMutation({
    mutationFn: async (existing?: Edition) => {
      const edition =
        existing ??
        (await createEdition({
          work_id: work.id,
          name: form.name.trim() || work.title,
          publisher: form.publisher.trim() || null,
          total_volumes: form.total ? Number(form.total) : null,
          is_finished: false,
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
          <div className="field">
            <label htmlFor="new-total">Total de volumes</label>
            <input id="new-total" className="input" type="number" min={1} max={999} inputMode="numeric" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={add.isPending} style={{ justifySelf: "start" }}>
          Adicionar à coleção
        </button>
        {add.error && <p className="error" role="alert">{(add.error as Error).message}</p>}
      </form>
    </div>
  );
}
