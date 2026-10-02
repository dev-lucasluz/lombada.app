import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteFeedback, getFeedbackImage, isAdmin, listFeedback, setFeedbackStatus, type Feedback, type FeedbackStatus } from "../lib/db";
import { Skeleton } from "../components/Skeleton";
import "./pages.css";
import "./AdminPage.css";

const KIND_LABEL = { erro: "Erro", ideia: "Ideia", elogio: "Elogio" } as const;
const STATUS_LABEL: Record<FeedbackStatus, string> = { novo: "Novo", lido: "Lido", resolvido: "Resolvido" };
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Só o administrador entra (conferido no banco); quem não é volta para o início. */
export function AdminPage() {
  const qc = useQueryClient();
  const admin = useQuery({ queryKey: ["is-admin"], queryFn: isAdmin, staleTime: 5 * 60_000 });
  const [filter, setFilter] = useState<FeedbackStatus | "todos">("novo");
  const list = useQuery({ queryKey: ["feedback"], queryFn: listFeedback, enabled: admin.data === true });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) => setFeedbackStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  });
  const remove = useMutation({
    mutationFn: deleteFeedback,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback"] }),
  });

  if (admin.isLoading) return <div className="page"><Skeleton /></div>;
  if (!admin.data) return <Navigate to="/" replace />;

  const all = list.data ?? [];
  const shown = filter === "todos" ? all : all.filter((f) => f.status === filter);
  const count = (s: FeedbackStatus) => all.filter((f) => f.status === s).length;

  return (
    <div className="page admin">
      <header className="page-head">
        <div>
          <h1>Feedback dos usuários</h1>
          <p>
            {all.length} {all.length === 1 ? "mensagem" : "mensagens"}, {count("novo")} {count("novo") === 1 ? "nova" : "novas"}
          </p>
        </div>
      </header>

      <div className="segmented" role="group" aria-label="Filtrar por situação">
        {(["novo", "lido", "resolvido", "todos"] as const).map((s) => (
          <button key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === "todos" ? "Todos" : `${STATUS_LABEL[s]} (${count(s)})`}
          </button>
        ))}
      </div>

      {list.error && <p className="error" role="alert">{(list.error as Error).message}</p>}
      {list.data && shown.length === 0 && <p className="muted">Nenhuma mensagem nesta lista.</p>}

      <ul className="feedback-list">
        {shown.map((f) => (
          <FeedbackRow
            key={f.id}
            f={f}
            onStatus={(status) => update.mutate({ id: f.id, status })}
            onDelete={() => remove.mutate(f.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function FeedbackRow({ f, onStatus, onDelete }: { f: Feedback; onStatus: (s: FeedbackStatus) => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`feedback-item is-${f.status}`}>
      <div className="feedback-meta">
        <span className={`feedback-kind kind-${f.kind}`}>{KIND_LABEL[f.kind]}</span>
        <span>{f.user_email ?? "sem e-mail"}</span>
        <span>{dateFmt.format(new Date(f.created_at))}</span>
        {f.page && <span>em {f.page}</span>}
      </div>
      <p className="feedback-text">{f.message}</p>
      {f.has_image && <FeedbackPhoto id={f.id} />}
      {f.user_agent && <small className="hint">{f.user_agent}</small>}
      <div className="feedback-actions">
        {/* Um único próximo passo por mensagem: novo → lido → resolvido */}
        {f.status === "novo" && <button className="btn btn-ghost" onClick={() => onStatus("lido")}>Marcar como lido</button>}
        {f.status === "lido" && <button className="btn btn-ghost" onClick={() => onStatus("resolvido")}>Marcar como resolvido</button>}
        {f.status === "resolvido" && <button className="btn btn-ghost" onClick={() => onStatus("novo")}>Reabrir</button>}
        {f.status === "novo" && <button className="btn-text" onClick={() => onStatus("resolvido")}>Já resolvido</button>}
        {f.status === "lido" && <button className="btn-text" onClick={() => onStatus("novo")}>Voltar para novo</button>}

        <span className="feedback-actions-end">
          {confirming ? (
            <>
              <span className="hint">Apagar de vez?</span>
              <button className="btn-text is-danger" onClick={onDelete}>Sim, apagar</button>
              <button className="btn-text" onClick={() => setConfirming(false)}>Não</button>
            </>
          ) : (
            <button className="btn-text is-danger" onClick={() => setConfirming(true)}>Apagar</button>
          )}
        </span>
      </div>
    </li>
  );
}

/** A foto só é baixada quando o administrador clica (a lista não carrega todas de uma vez). */
function FeedbackPhoto({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const photo = useQuery({ queryKey: ["feedback-photo", id], queryFn: () => getFeedbackImage(id), enabled: open, staleTime: Infinity });
  return (
    <div className="feedback-photo">
      {!open ? (
        <button className="btn btn-ghost" onClick={() => setOpen(true)}>Ver foto anexada</button>
      ) : photo.isLoading ? (
        <span className="muted">Carregando a foto…</span>
      ) : photo.data ? (
        <img src={photo.data} alt="Foto anexada ao feedback" />
      ) : (
        <span className="error">Não foi possível carregar a foto.</span>
      )}
    </div>
  );
}
