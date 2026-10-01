import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ackFeedback, listFeedbackUpdates, type FeedbackUpdate } from "../lib/db";
import "./FeedbackNotice.css";

const short = (text: string) => (text.length > 70 ? `${text.slice(0, 70).trim()}…` : text);

/** Avisa a pessoa quando um feedback que ela enviou foi lido ou resolvido. */
export function FeedbackNotice() {
  const qc = useQueryClient();
  const updates = useQuery({ queryKey: ["feedback-updates"], queryFn: listFeedbackUpdates, staleTime: 60_000 });
  const ack = useMutation({
    mutationFn: ackFeedback,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback-updates"] }),
  });

  const list = updates.data ?? [];
  if (list.length === 0) return null;

  return (
    <div className="notice-stack" role="status">
      {list.slice(0, 2).map((f) => (
        <Notice key={f.id} f={f} onClose={() => ack.mutate(f.id)} />
      ))}
    </div>
  );
}

function Notice({ f, onClose }: { f: FeedbackUpdate; onClose: () => void }) {
  return (
    <div className="notice-toast">
      <span>
        {f.status === "resolvido" ? "Seu feedback foi resolvido. Obrigado por ajudar!" : "Seu feedback foi lido."}{" "}
        <small>“{short(f.message)}”</small>
      </span>
      <button className="btn btn-ghost" onClick={onClose}>Ok</button>
    </div>
  );
}
