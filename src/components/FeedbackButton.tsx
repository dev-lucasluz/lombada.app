import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendFeedback, type FeedbackKind } from "../lib/db";
import "./FeedbackButton.css";

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "erro", label: "Erro" },
  { value: "ideia", label: "Ideia" },
  { value: "elogio", label: "Elogio" },
];

const PROMPT: Record<FeedbackKind, string> = {
  erro: "O que deu errado?",
  ideia: "O que você gostaria de ver no app?",
  elogio: "O que você gostou?",
};

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("ideia");
  const [message, setMessage] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const send = useMutation({ mutationFn: sendFeedback });

  const close = () => {
    if (send.isSuccess) setMessage("");
    send.reset();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    textRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, send.isSuccess]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate({ kind, message: message.trim() });
  };

  return (
    <>
      <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="Enviar feedback" title="Enviar feedback">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 5h14v10H10l-5 4z" />
        </svg>
        <span>Feedback</span>
      </button>

      {open && (
        <div className="feedback-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <form className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title" onSubmit={submit}>
            {send.isSuccess ? (
              <>
                <h2 id="fb-title">Recebido, obrigado!</h2>
                <p className="hint">Sua mensagem chegou. Ela ajuda a melhorar o Lombada.</p>
                <button type="button" className="btn btn-primary" onClick={close}>Fechar</button>
              </>
            ) : (
              <>
                <h2 id="fb-title">Enviar feedback</h2>
                <div className="segmented" role="group" aria-label="Tipo de mensagem">
                  {KINDS.map((k) => (
                    <button type="button" key={k.value} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="fb-msg">{PROMPT[kind]}</label>
                  <textarea
                    id="fb-msg"
                    ref={textRef}
                    className="input"
                    rows={5}
                    required
                    minLength={3}
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
                {send.error && <p className="error" role="alert">{(send.error as Error).message}</p>}
                <div className="head-actions">
                  <button className="btn btn-primary" type="submit" disabled={send.isPending || message.trim().length < 3}>
                    {send.isPending ? "Enviando…" : "Enviar feedback"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
