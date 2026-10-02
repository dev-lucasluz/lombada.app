import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disableShare, enableShare, getShareToken, renewShare } from "../lib/db";
import "./ShareControls.css";

/** Link público da estante, o estado de ligado/desligado e as ações de compartilhar. */
export function ShareControls() {
  const qc = useQueryClient();
  const share = useQuery({ queryKey: ["share-token"], queryFn: getShareToken });
  const [copied, setCopied] = useState(false);
  const set = (token: string | null) => {
    qc.setQueryData(["share-token"], token);
    setCopied(false);
  };
  const enable = useMutation({ mutationFn: enableShare, onSuccess: set });
  const renew = useMutation({ mutationFn: renewShare, onSuccess: set });
  const disable = useMutation({ mutationFn: disableShare, onSuccess: () => set(null) });

  const token = share.data ?? null;
  const url = token ? `${window.location.origin}/estante/${token}` : "";
  const message = `Veja a minha estante de mangás e livros no Lombada: ${url}`;
  const error = (share.error ?? enable.error ?? renew.error ?? disable.error) as Error | null;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "Minha estante no Lombada", text: "Veja a minha estante de mangás e livros.", url });
    } catch {
      // A pessoa fechou a janela de compartilhar: nada a fazer.
    }
  };

  return (
    <div className="share">
      <p className="hint">
        Gere um link para os amigos verem a sua estante, só para ler. Eles não precisam de conta. Não aparecem o seu
        e-mail, as anotações nem as séries +18.
      </p>

      {token ? (
        <>
          <div className="field">
            <label htmlFor="share-url">Link da sua estante</label>
            <input id="share-url" className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div className="share-actions">
            <button className="btn btn-primary" onClick={copy}>{copied ? "Link copiado" : "Copiar link"}</button>
            <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              Enviar no WhatsApp
            </a>
            {canNativeShare && <button className="btn btn-ghost" onClick={nativeShare}>Mais opções…</button>}
          </div>
          <div className="share-more">
            <button
              type="button"
              className="btn-text"
              disabled={renew.isPending}
              onClick={() => confirm("Gerar um link novo? O link atual deixa de funcionar.") && renew.mutate()}
            >
              Gerar novo link
            </button>
            <button type="button" className="btn-text is-danger" disabled={disable.isPending} onClick={() => disable.mutate()}>
              Parar de compartilhar
            </button>
          </div>
        </>
      ) : (
        <button
          className="btn btn-primary"
          style={{ justifySelf: "start" }}
          disabled={enable.isPending || share.isLoading}
          onClick={() => enable.mutate()}
        >
          Criar link para compartilhar
        </button>
      )}

      {error && (
        <p className="error" role="alert">
          {share.error ? "O compartilhamento ainda não foi ativado neste servidor." : error.message}
        </p>
      )}
    </div>
  );
}
