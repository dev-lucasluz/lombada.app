import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendFeedback, type FeedbackKind } from "../lib/db";
import { prepareFeedbackImage } from "../lib/quickAdd";
import { Dialog } from "./Dialog";
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
  // Foto opcional, já reduzida e convertida para JPEG (data URL).
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Enquanto a pessoa digita em outro campo, o botão flutuante sai do caminho (celular).
  const [typing, setTyping] = useState(false);

  const send = useMutation({ mutationFn: sendFeedback });

  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.closest(".dialog");
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const close = () => {
    if (send.isSuccess) {
      setMessage("");
      setImage(null);
    }
    setImageError(null);
    send.reset();
    setOpen(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate({ kind, message: message.trim(), image });
  };

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    setPreparing(true);
    try {
      setImage(await prepareFeedbackImage(file));
    } catch (err) {
      setImage(null);
      setImageError(err instanceof Error ? err.message : "Não foi possível usar essa imagem.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <button
        className={typing ? "feedback-fab is-away" : "feedback-fab"}
        onClick={() => setOpen(true)}
        aria-label="Enviar feedback"
        title="Enviar feedback"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 5h14v10H10l-5 4z" />
        </svg>
        <span>Feedback</span>
      </button>

      {open && (
        <Dialog titleId="fb-title" onClose={close}>
          {send.isSuccess ? (
            <>
              <h2 id="fb-title">Recebido, obrigado!</h2>
              <p className="hint">Sua mensagem chegou. Ela ajuda a melhorar o Lombada.</p>
              <div className="dialog-actions">
                <button type="button" className="btn btn-primary" onClick={close}>Fechar</button>
              </div>
            </>
          ) : (
            <>
              <h2 id="fb-title">Conte pra gente</h2>
              <form className="dialog-form" onSubmit={submit}>
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
                    data-autofocus
                    className="input"
                    rows={5}
                    required
                    minLength={3}
                    maxLength={2000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
                <div className="feedback-attach">
                  {image ? (
                    <div className="feedback-thumb">
                      <img src={image} alt="Foto anexada ao feedback" />
                      <button type="button" className="btn btn-ghost" onClick={() => setImage(null)}>Remover foto</button>
                    </div>
                  ) : (
                    <label className={preparing ? "btn btn-ghost is-busy" : "btn btn-ghost"}>
                      {preparing ? "Preparando a foto…" : "Anexar foto (opcional)"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} disabled={preparing} className="visually-hidden" />
                    </label>
                  )}
                  <small className="hint">Só você e o administrador do Lombada veem a foto. Não envie dados pessoais, como documentos.</small>
                </div>
                {imageError && <p className="error" role="alert">{imageError}</p>}
                {send.error && <p className="error" role="alert">{(send.error as Error).message}</p>}
                <div className="dialog-actions">
                  <button className="btn btn-primary" type="submit" disabled={send.isPending || message.trim().length < 3}>
                    {send.isPending ? "Enviando…" : "Enviar feedback"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
                </div>
              </form>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
