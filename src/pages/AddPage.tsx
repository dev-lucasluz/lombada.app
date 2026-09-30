import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchBooks, searchManga, type CatalogResult } from "../lib/catalog";
import { addToCollection, createEdition, ensureWork, listEditions, type Work } from "../lib/db";
import { Icon } from "../components/Icon";
import { Cover } from "./CollectionPage";
import "./pages.css";

type Kind = "manga" | "book";

export function AddPage() {
  const [kind, setKind] = useState<Kind>("manga");
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [work, setWork] = useState<{ work: Work; result: CatalogResult } | null>(null);

  const search = useQuery({
    queryKey: ["catalog", kind, submitted],
    queryFn: () => (kind === "manga" ? searchManga(submitted) : searchBooks(submitted)),
    enabled: submitted.length >= 2,
    staleTime: 5 * 60_000,
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

      <div className="segmented" role="group" aria-label="Tipo">
        <button aria-pressed={kind === "manga"} onClick={() => setKind("manga")}>Mangá</button>
        <button aria-pressed={kind === "book"} onClick={() => setKind("book")}>Livro</button>
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

      {search.isFetching && <p className="muted">Buscando…</p>}
      {search.error && <p className="error" role="alert">{(search.error as Error).message}</p>}
      {pick.error && <p className="error" role="alert">{(pick.error as Error).message}</p>}
      {search.data && search.data.length === 0 && (
        <p className="muted">Nada encontrado para “{submitted}”. Tente o nome em inglês ou romaji.</p>
      )}

      {search.data && search.data.length > 0 && (
        <ul className="results">
          {search.data.map((r) => (
            <li key={r.externalId}>
              <button className="result" onClick={() => pick.mutate(r)} disabled={pick.isPending}>
                <Cover url={r.coverUrl} title={r.title} />
                <div>
                  <h3>{r.title}</h3>
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

  const add = useMutation({
    mutationFn: async (editionId?: string) => {
      const id =
        editionId ??
        (
          await createEdition({
            work_id: work.id,
            name: form.name.trim() || work.title,
            publisher: form.publisher.trim() || null,
            total_volumes: form.total ? Number(form.total) : null,
            is_finished: false,
          })
        ).id;
      return addToCollection(id);
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

      {editions.data && editions.data.length > 0 && (
        <section className="panel">
          <h2>Edições cadastradas</h2>
          <ul className="results">
            {editions.data.map((ed) => (
              <li key={ed.id}>
                <button className="result" onClick={() => add.mutate(ed.id)} disabled={add.isPending}>
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
