import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteReading,
  listReading,
  READING_STATUS_LABEL,
  saveReading,
  type ReadingEntry,
  type ReadingStatus,
} from "../lib/db";
import "./pages.css";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

function formatChapter(n: number | null) {
  return n === null ? "–" : Number(n).toLocaleString("pt-BR");
}

export function ReadingPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["reading"], queryFn: listReading });
  const [editing, setEditing] = useState<ReadingEntry | "new" | null>(null);

  const bump = useMutation({
    mutationFn: (e: ReadingEntry) =>
      saveReading({ id: e.id, title: e.title, last_chapter: (Number(e.last_chapter) || 0) + 1, last_read_at: new Date().toISOString() }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["reading"] }),
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Leitura</h1>
          <p>Onde você parou em cada mangá que lê online.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>Registrar leitura</button>
      </header>

      {editing && <ReadingForm entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      {isLoading && <p className="muted">Carregando…</p>}
      {error && <p className="error" role="alert">{(error as Error).message}</p>}

      {data && data.length === 0 && !editing && (
        <div className="empty">
          <h2>Nenhuma leitura registrada</h2>
          <p>Anote o mangá e o capítulo em que parou. Quando voltar a ler, ele estará aqui.</p>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>Registrar a primeira leitura</button>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="reading-list">
          {data.map((e) => (
            <li key={e.id} className="reading-row">
              <div className="reading-info">
                <h2>{e.title}</h2>
                <div className="reading-sub">
                  <span className="status-pill" data-status={e.status}>{READING_STATUS_LABEL[e.status]}</span>
                  <span>Última leitura em {dateFmt.format(new Date(e.last_read_at))}</span>
                  {e.latest_released_chapter !== null && <span>Lançado até o {formatChapter(e.latest_released_chapter)}</span>}
                </div>
                {e.notes && <p className="hint">{e.notes}</p>}
              </div>
              <div className="chapter">
                <small>Parei no</small>
                <span className="num">{formatChapter(e.last_chapter)}</span>
              </div>
              <div className="row-actions">
                <button className="btn btn-ghost btn-s" onClick={() => bump.mutate(e)} disabled={bump.isPending}>
                  Li mais um
                </button>
                {e.source_url && (
                  <a className="btn btn-ghost btn-s" href={e.source_url} target="_blank" rel="noopener noreferrer">
                    Continuar lendo
                  </a>
                )}
                {e.status === "hiatus" && (
                  <Link className="btn btn-ghost btn-s" to={`/lembretes?leitura=${e.id}`}>Criar lembrete</Link>
                )}
                <button className="btn btn-ghost btn-s" onClick={() => setEditing(e)}>Editar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReadingForm({ entry, onClose }: { entry: ReadingEntry | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: entry?.title ?? "",
    status: entry?.status ?? ("reading" as ReadingStatus),
    last_chapter: entry?.last_chapter?.toString() ?? "",
    latest_released_chapter: entry?.latest_released_chapter?.toString() ?? "",
    source_url: entry?.source_url ?? "",
    notes: entry?.notes ?? "",
  });

  const toNumber = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  const save = useMutation({
    mutationFn: () =>
      saveReading({
        id: entry?.id,
        title: form.title.trim(),
        status: form.status,
        last_chapter: toNumber(form.last_chapter),
        latest_released_chapter: toNumber(form.latest_released_chapter),
        source_url: form.source_url.trim() || null,
        notes: form.notes.trim() || null,
        last_read_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reading"] });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteReading(entry!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reading"] });
      onClose();
    },
  });

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>{entry ? "Editar leitura" : "Registrar leitura"}</h2>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor="r-title">Mangá</label>
          <input id="r-title" className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-last">Capítulo em que parei</label>
          <input id="r-last" className="input" inputMode="decimal" placeholder="Ex.: 100" value={form.last_chapter} onChange={(e) => setForm({ ...form, last_chapter: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-status">Situação</label>
          <select id="r-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ReadingStatus })}>
            {Object.entries(READING_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-released">Último capítulo lançado (opcional)</label>
          <input id="r-released" className="input" inputMode="decimal" value={form.latest_released_chapter} onChange={(e) => setForm({ ...form, latest_released_chapter: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="r-url">Link de onde você lê (opcional)</label>
          <input id="r-url" className="input" type="url" placeholder="https://" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </div>
        <div className="field span-2">
          <label htmlFor="r-notes">Anotações (opcional)</label>
          <textarea id="r-notes" className="input" rows={2} placeholder="Ex.: volta do hiato prevista para outubro" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="head-actions">
        <button className="btn btn-primary" type="submit" disabled={save.isPending}>Salvar leitura</button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
      </div>
      {entry && (
        <button
          type="button"
          className="danger-link"
          onClick={() => confirm(`Apagar o registro de ${entry.title}?`) && remove.mutate()}
        >
          Apagar registro
        </button>
      )}
      {save.isError && <p className="error" role="alert">{(save.error as Error).message}</p>}
    </form>
  );
}
