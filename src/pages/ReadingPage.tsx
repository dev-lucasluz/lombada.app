import { useEffect, useRef, useState } from "react";
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
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import "./pages.css";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });

function formatChapter(n: number | null) {
  return n === null ? "–" : Number(n).toLocaleString("pt-BR");
}

/** Um bloco para cada situação; os que estiverem vazios não aparecem. "Abandonado" não é mais uma coluna:
 * o que já estiver marcado assim fica junto dos pausados. */
const GROUPS: { statuses: ReadingStatus[]; title: string }[] = [
  { statuses: ["reading"], title: "Lendo" },
  { statuses: ["hiatus"], title: "Em hiato" },
  { statuses: ["paused", "dropped"], title: "Pausados" },
  { statuses: ["finished"], title: "Concluídos" },
];

type Undo = { id: string; title: string; chapter: number | null; readAt: string; newChapter: number };

export function ReadingPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["reading"], queryFn: listReading });
  const [editing, setEditing] = useState<ReadingEntry | "new" | null>(null);
  // "Li mais um" pode ser desfeito por alguns segundos.
  const [undo, setUndo] = useState<Undo | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  // Ordem congelada enquanto o "Desfazer" está à mostra: o cartão não pula de lugar na hora do +1.
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const bump = useMutation({
    onMutate: () => setFrozenOrder((prev) => prev ?? (data ?? []).map((x) => x.id)),
    onError: () => setFrozenOrder(null),
    mutationFn: async (e: ReadingEntry) => {
      const newChapter = (Number(e.last_chapter) || 0) + 1;
      await saveReading({ id: e.id, title: e.title, last_chapter: newChapter, last_read_at: new Date().toISOString() });
      return { id: e.id, title: e.title, chapter: e.last_chapter, readAt: e.last_read_at, newChapter } satisfies Undo;
    },
    onSuccess: (u) => {
      setUndo(u);
      window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => {
        setUndo(null);
        setFrozenOrder(null); // passou o prazo: agora o cartão vai para o topo da coluna
      }, 7000);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["reading"] }),
  });

  const revert = useMutation({
    mutationFn: (u: Undo) => saveReading({ id: u.id, title: u.title, last_chapter: u.chapter, last_read_at: u.readAt }),
    onSuccess: () => {
      window.clearTimeout(undoTimer.current);
      setUndo(null);
      setFrozenOrder(null);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["reading"] }),
  });

  const rank = (id: string) => {
    const i = frozenOrder?.indexOf(id) ?? -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const entries = frozenOrder ? [...(data ?? [])].sort((a, b) => rank(a.id) - rank(b.id)) : (data ?? []);

  const card = (e: ReadingEntry) => (
    <li key={e.id} className="reading-row">
      <div className="reading-info">
        <div className="reading-title">
          <h3>{e.title}</h3>
          <button type="button" className="icon-btn" onClick={() => setEditing(e)} aria-label={`Editar ${e.title}`} title="Editar">
            <Icon name="edit" size={16} />
          </button>
        </div>
        <div className="reading-sub">
          <span className="status-pill" data-status={e.status}>{READING_STATUS_LABEL[e.status]}</span>
          <span>Atualizado em {dateFmt.format(new Date(e.last_read_at))}</span>
          {e.latest_released_chapter !== null && <span>Lançado até o {formatChapter(e.latest_released_chapter)}</span>}
        </div>
        {e.notes && <p className="hint">{e.notes}</p>}
      </div>
      <div className="chapter">
        <small>Parei no</small>
        <div className="chapter-line">
          <span className="num">{formatChapter(e.last_chapter)}</span>
          <button
            className="btn btn-ghost btn-s"
            onClick={() => bump.mutate(e)}
            disabled={bump.isPending}
            aria-label={`Li mais um capítulo de ${e.title}`}
            title="Li mais um capítulo"
          >
            +1
          </button>
        </div>
      </div>
      {(e.source_url || e.status === "hiatus") && (
        <div className="row-actions">
          {e.status === "hiatus" && (
            <Link className="btn btn-ghost btn-s" to={`/lembretes?leitura=${e.id}`}>Criar lembrete</Link>
          )}
          {e.source_url && (
            <a className="btn btn-ghost btn-s" href={e.source_url} target="_blank" rel="noopener noreferrer">
              Continuar lendo
            </a>
          )}
        </div>
      )}
      {undo?.id === e.id && (
        <div className="row-undo" role="status">
          <span>Capítulo {formatChapter(undo.newChapter)} registrado.</span>
          <button className="btn btn-ghost btn-s" onClick={() => revert.mutate(undo)} disabled={revert.isPending}>
            Desfazer
          </button>
        </div>
      )}
    </li>
  );

  return (
    <div className="page">
      <header className="page-head">
        <div className="reading-head">
          <h1>Onde parei</h1>
          <p>O capítulo em que você parou em cada mangá que lê em outros sites.</p>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>Anotar mangá</button>
        </div>
      </header>

      {editing && <ReadingForm entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      {isLoading && <Skeleton rows={2} title={false} />}
      {error && <p className="error" role="alert">{(error as Error).message}</p>}

      {data && data.length === 0 && (
        <div className="empty">
          <h2>Nenhum mangá anotado</h2>
          <p>Anote o mangá e o capítulo em que parou. Quando voltar a ler, ele estará aqui.</p>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>Anotar o primeiro mangá</button>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="reading-groups">
          {GROUPS.map(({ statuses, title }) => {
            const list = entries.filter((e) => statuses.includes(e.status));
            if (list.length === 0) return null;
            return (
              <section key={title} className="reading-group" aria-labelledby={`g-${statuses[0]}`}>
                <h2 id={`g-${statuses[0]}`}>
                  {title} <span className="hint">{list.length}</span>
                </h2>
                <ul className="reading-grid">{list.map(card)}</ul>
              </section>
            );
          })}

        </div>
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
    <Dialog titleId="reading-title" onClose={onClose} wide>
      <h2 id="reading-title">{entry ? "Editar anotação" : "Anotar mangá"}</h2>
      <form
        className="dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="r-title">Mangá</label>
            <input id="r-title" data-autofocus className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r-last">Capítulo em que parei</label>
            <input id="r-last" className="input" inputMode="decimal" placeholder="Ex.: 100" value={form.last_chapter} onChange={(e) => setForm({ ...form, last_chapter: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r-status">Situação</label>
            <select id="r-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ReadingStatus })}>
              {Object.entries(READING_STATUS_LABEL)
                .filter(([value]) => value !== "dropped" || form.status === "dropped")
                .map(([value, label]) => (
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
        {save.isError && <p className="error" role="alert">{(save.error as Error).message}</p>}
        <div className="dialog-actions">
          <button className="btn btn-primary" type="submit" disabled={save.isPending}>Salvar</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          {entry && (
            <button
              type="button"
              className="danger-link"
              onClick={() => confirm(`Apagar o registro de ${entry.title}?`) && remove.mutate()}
            >
              Apagar registro
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
