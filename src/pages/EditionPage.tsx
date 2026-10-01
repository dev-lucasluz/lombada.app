import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCollectionItem,
  listCollection,
  removeFromCollection,
  setVolumesOwned,
  updateEdition,
  volumesAbove,
  type CollectionItem,
} from "../lib/db";
import { formatRanges, missingVolumes, parseRanges } from "../lib/ranges";
import { seriesHue, seriesHues } from "../lib/spineColor";
import { VolumeGrid } from "../components/Shelf";
import { Icon } from "../components/Icon";
import { Cover } from "./CollectionPage";
import { editionLabel } from "../lib/editionLabel";
import "./pages.css";

export function EditionPage() {
  const { id = "" } = useParams();
  const queryKey = ["collection", id];
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: item, isLoading, error } = useQuery({ queryKey, queryFn: () => getCollectionItem(id) });
  // Lista da coleção (normalmente já em cache) para a lombada ter a mesma cor das outras telas
  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });

  // Atualização otimista: a lombada muda na hora e volta se o banco recusar.
  const toggle = useMutation({
    mutationFn: ({ volumes, owned }: { volumes: number[]; owned: boolean }) =>
      setVolumesOwned(id, volumes, owned),
    onMutate: async ({ volumes, owned }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<CollectionItem>(queryKey);
      if (previous) {
        const set = new Set(previous.owned);
        volumes.forEach((v) => (owned ? set.add(v) : set.delete(v)));
        qc.setQueryData<CollectionItem>(queryKey, { ...previous, owned: [...set].sort((a, b) => a - b) });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => ctx?.previous && qc.setQueryData(queryKey, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ["collection"] }),
  });

  const remove = useMutation({
    mutationFn: () => removeFromCollection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection"] });
      navigate("/colecao");
    },
  });

  if (isLoading) return <div className="page"><p className="muted">Carregando…</p></div>;
  if (error || !item) {
    return (
      <div className="page">
        <p className="error">Não encontramos essa série na sua coleção.</p>
        <Link to="/colecao" className="back-link"><Icon name="back" size={18} /> Voltar para a coleção</Link>
      </div>
    );
  }

  const { edition } = item;
  const owned = new Set(item.owned);
  const total = edition.total_volumes ?? Math.max(item.owned.length ? Math.max(...item.owned) : 0, 10);
  const missing = missingVolumes(item.owned, edition.total_volumes);

  return (
    <div className="page">
      <Link to="/colecao" className="back-link"><Icon name="back" size={18} /> Coleção</Link>

      <header className="edition-head">
        <Cover url={edition.work.cover_url} title={edition.work.title} size="l" />
        <div className="edition-meta">
          <h1>{edition.work.title}</h1>
          {editionLabel(edition, edition.work.title) && <span>{editionLabel(edition, edition.work.title)}</span>}
          {edition.work.authors.length > 0 && <span className="hint">{edition.work.authors.join(", ")}</span>}
        </div>
      </header>

      <dl className="summary">
        <dt>Tenho</dt>
        <dd>
          <span className="num">{item.owned.length}</span>
          {edition.total_volumes ? ` de ${edition.total_volumes}` : ""}
          {item.owned.length > 0 && `: ${formatRanges(item.owned)}`}
        </dd>
        <dt>Falta</dt>
        <dd>
          {edition.total_volumes === null ? (
            <span className="muted">Informe o total de volumes da edição para ver o que falta.</span>
          ) : missing.length === 0 ? (
            <mark>Nada, coleção completa</mark>
          ) : (
            <mark>{formatRanges(missing)}</mark>
          )}
        </dd>
      </dl>

      <section className="panel">
        <h2>Volumes</h2>
        <p className="hint">Toque num volume para marcar ou desmarcar. No computador, Shift+clique marca um intervalo inteiro.</p>
        <VolumeGrid
          total={total}
          owned={owned}
          hue={seriesHues(collection.data ?? []).get(item.id) ?? seriesHue(edition.id)}
          onChange={(volumes, isOwned) => toggle.mutate({ volumes, owned: isOwned })}
        />
        {edition.total_volumes !== null && edition.total_volumes > 0 && (
          <div className="head-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={missing.length === 0 || toggle.isPending}
              onClick={() => toggle.mutate({ volumes: missing, owned: true })}
            >
              <Icon name="check" size={18} /> Marcar todos os {edition.total_volumes} volumes
            </button>
            {item.owned.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => toggle.mutate({ volumes: item.owned, owned: false })}>
                Desmarcar todos
              </button>
            )}
          </div>
        )}
        <BulkMark onApply={(volumes, isOwned) => toggle.mutate({ volumes, owned: isOwned })} />
        {toggle.isError && <p className="error" role="alert">Não foi possível salvar. Verifique a conexão e tente de novo.</p>}
      </section>

      <EditionSettings item={item} />

      <button
        className="danger-link"
        onClick={() => {
          if (confirm(`Remover ${edition.work.title}${editionLabel(edition, edition.work.title) ? ` (${editionLabel(edition, edition.work.title)})` : ""} da sua coleção? Os volumes marcados serão apagados.`)) {
            remove.mutate();
          }
        }}
      >
        Remover da coleção
      </button>
    </div>
  );
}

function BulkMark({ onApply }: { onApply: (volumes: number[], owned: boolean) => void }) {
  const [text, setText] = useState("");
  const volumes = parseRanges(text);

  const apply = (owned: boolean) => (e: FormEvent) => {
    e.preventDefault();
    if (volumes.length === 0) return;
    onApply(volumes, owned);
    setText("");
  };

  return (
    <form className="bulk" onSubmit={apply(true)}>
      <div className="field">
        <label htmlFor="bulk">Marcar vários de uma vez</label>
        <input
          id="bulk"
          className="input"
          placeholder="Ex.: 1-30, 45, 50 a 52"
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={volumes.length === 0}>
        Marcar {volumes.length > 0 ? volumes.length : ""}
      </button>
      <button type="button" className="btn btn-ghost" disabled={volumes.length === 0} onClick={apply(false)}>
        Desmarcar
      </button>
    </form>
  );
}

function EditionSettings({ item }: { item: CollectionItem }) {
  const { edition } = item;
  const qc = useQueryClient();
  const [open, setOpen] = useState(edition.total_volumes === null);
  const [form, setForm] = useState({
    name: edition.name,
    publisher: edition.publisher ?? "",
    total: edition.total_volumes?.toString() ?? "",
    finished: edition.is_finished,
  });

  const save = useMutation({
    mutationFn: async () => {
      const total = form.total ? Number(form.total) : null;
      // Total menor que os volumes marcados: oferece limpar os que passaram do limite.
      if (total !== null) {
        const extras = await volumesAbove(item.id, total);
        if (
          extras.length > 0 &&
          confirm(`Você tem ${extras.length} ${extras.length === 1 ? "volume marcado" : "volumes marcados"} acima de ${total} (${formatRanges(extras)}). Remover da sua coleção?`)
        ) {
          await setVolumesOwned(item.id, extras, false);
        }
      }
      await updateEdition(edition.id, {
        name: form.name.trim() || edition.name,
        publisher: form.publisher.trim() || null,
        total_volumes: total,
        is_finished: form.finished,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection"] });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
        Editar dados da edição
      </button>
    );
  }

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>Dados da edição</h2>
      <p className="hint">
        Essas informações são compartilhadas com todos que colecionam esta edição.
        {edition.work.original_volumes ? ` A edição original tem ${edition.work.original_volumes} volumes.` : ""}
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ed-name">Nome da edição</label>
          <input id="ed-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ed-pub">Editora</label>
          <input id="ed-pub" className="input" placeholder="Ex.: Panini" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ed-total">Total de volumes</label>
          <input id="ed-total" className="input" type="number" min={1} max={999} inputMode="numeric" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
        </div>
        <label className="field" style={{ alignContent: "end" }}>
          <span style={{ display: "flex", gap: "0.5rem", alignItems: "center", minHeight: 44 }}>
            <input type="checkbox" checked={form.finished} onChange={(e) => setForm({ ...form, finished: e.target.checked })} />
            A edição já terminou de sair
          </span>
        </label>
      </div>
      <div className="head-actions">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>Salvar edição</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
      {save.isError && <p className="error" role="alert">{(save.error as Error).message}</p>}
    </form>
  );
}
