import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../lib/auth";
import { disableShare, enableShare, getShareToken, isAdmin, listCollection, listReading, renewShare } from "../lib/db";
import { missingVolumes } from "../lib/ranges";
import { isStandalone } from "../components/BookShelf";
import { isDemo } from "../lib/demo";
import { seriesHues, volumeColor } from "../lib/spineColor";
import { PasswordInput } from "../components/PasswordInput";
import "./pages.css";
import "./ProfilePage.css";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Aspas e quebras de linha escapadas para CSV (Excel em português usa ponto e vírgula). */
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function ProfilePage() {
  const { session, updateName, updatePassword, verifyPassword, signOut } = useAuth();
  const user = session?.user;
  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });
  const reading = useQuery({ queryKey: ["reading"], queryFn: listReading });

  const admin = useQuery({ queryKey: ["is-admin"], queryFn: isAdmin, staleTime: 5 * 60_000 });

  const items = collection.data ?? [];
  const volumes = items.reduce((sum, c) => sum + c.owned.length, 0);
  const books = items.filter(isStandalone);
  const series = items.filter((i) => !isStandalone(i));
  const complete = items.filter((i) => i.edition.total_volumes !== null && i.owned.length >= i.edition.total_volumes);
  const missing = items.reduce((sum, i) => sum + missingVolumes(i.owned, i.edition.total_volumes).length, 0);
  const biggest = [...items].sort((a, b) => b.owned.length - a.owned.length)[0];
  const latest = items[0]; // a lista já vem ordenada pelas últimas adições
  const displayName = (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email?.split("@")[0] || "Você";
  const memberSince = user?.created_at ? dateFmt.format(new Date(user.created_at)) : null;

  const exportCsv = () => {
    const rows = (collection.data ?? []).map((c) =>
      [c.edition.work.title, c.edition.name, c.edition.publisher ?? "", c.owned.length, c.edition.total_volumes ?? "", c.owned.join(" ")]
        .map(csv)
        .join(";"),
    );
    const header = ["Série", "Edição", "Editora", "Volumes que tenho", "Total de volumes", "Números dos volumes"].map(csv).join(";");
    const blob = new Blob(["﻿" + [header, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lombada-colecao-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasPassword = ((user?.app_metadata?.providers as string[] | undefined) ?? ["email"]).includes("email");

  return (
    <div className="page profile">
      <section className="profile-hero" aria-labelledby="profile-name">
        <div className="profile-hero-top">
          <div className="profile-who">
            <span className="profile-avatar" aria-hidden="true">{displayName.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
            <div className="profile-id">
              <h1 id="profile-name">{displayName}</h1>
              <span>{user?.email ?? ""}</span>
              {memberSince && <small>No Lombada desde {memberSince}</small>}
            </div>
          </div>

          <ul className="profile-figures" aria-label="Resumo da coleção">
            <li className="is-main"><span className="num">{collection.data ? volumes : "–"}</span><small>volumes e livros</small></li>
            <li><span className="num">{collection.data ? series.length : "–"}</span><small>séries de mangá</small></li>
            <li><span className="num">{collection.data ? books.length : "–"}</span><small>livros avulsos</small></li>
            <li><span className="num">{collection.data ? complete.length : "–"}</span><small>completas</small></li>
            <li><span className="num">{collection.data ? missing : "–"}</span><small>faltando</small></li>
            <li><span className="num">{reading.data?.length ?? "–"}</span><small>em Onde parei</small></li>
          </ul>
        </div>

        {items.length > 0 && (
          <p className="profile-note">
            Maior coleção: <strong>{biggest.edition.work.title}</strong> ({biggest.owned.length} volumes). Última adição:{" "}
            <strong>{latest.edition.work.title}</strong>.
          </p>
        )}

        <ShelfBand items={items} />
      </section>

      <div className="profile-groups">
        <div className="profile-group">
          <h2>Conta</h2>
          <NameForm initial={(user?.user_metadata?.full_name as string | undefined) ?? ""} onSave={updateName} />

          <details className="profile-fold">
            <summary>{hasPassword ? "Trocar senha" : "Criar uma senha"}</summary>
            <PasswordForm
              onSave={updatePassword}
              verify={verifyPassword}
              // Quem entrou só pelo Google ainda não tem senha: nesse caso não há senha atual para pedir.
              hasPassword={hasPassword}
              disabled={isDemo}
            />
          </details>

          <div className="profile-row">
            <div>
              <strong>Sair da conta</strong>
              <span className="hint">Encerra a sessão neste aparelho. Seus dados continuam salvos.</span>
            </div>
            <button className="btn btn-ghost" onClick={signOut}>Sair</button>
          </div>
        </div>

        <div className="profile-group">
          <h2>Estante e dados</h2>
          {!isDemo && <SharePanel />}

          <div className="profile-row">
            <div>
              <strong>Baixar a coleção</strong>
              <span className="hint">
                Planilha (CSV) que abre no Excel e no Google Planilhas. Para apagar a conta e todos os dados, peça pelo
                e-mail da <a href="/privacidade">política de privacidade</a>.
              </span>
            </div>
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!collection.data?.length}>Baixar CSV</button>
          </div>

          {admin.data && (
            <div className="profile-row">
              <div>
                <strong>Administração</strong>
                <span className="hint">Mensagens enviadas pelos usuários pelo botão de feedback.</span>
              </div>
              <Link to="/admin" className="btn btn-ghost">Ver feedbacks</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A coleção inteira como uma faixa de lombadas: uma por volume, nas cores da Coleção. */
function ShelfBand({ items }: { items: { id: string; created_at: string; owned: number[] }[] }) {
  if (items.length === 0) return null;
  const hues = seriesHues(items as Parameters<typeof seriesHues>[0]);
  const ordered = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const spines = ordered.flatMap((i) => i.owned.map((n) => ({ key: `${i.id}-${n}`, n, hue: hues.get(i.id) ?? 0 })));
  // Muitos volumes: mostra uma amostra espaçada para a faixa caber sem ficar um borrão.
  const cap = 120;
  const step = Math.max(1, Math.ceil(spines.length / cap));
  const shown = spines.filter((_, idx) => idx % step === 0);
  return (
    <div className="shelf-band" aria-hidden="true">
      {shown.map((sp) => (
        <i key={sp.key} style={{ background: volumeColor(sp.hue, sp.n), height: `${62 + (sp.n % 4) * 12}%` }} />
      ))}
    </div>
  );
}

function NameForm({ initial, onSave }: { initial: string; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("saving");
    setError(null);
    try {
      await onSave(name.trim());
      setState("saved");
    } catch (err) {
      setError(authErrorMessage(err));
      setState("idle");
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Nome</h2>
      <div className="field">
        <label htmlFor="p-name">Como você quer ser chamado</label>
        <input id="p-name" className="input" required maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setState("idle"); }} autoComplete="name" />
      </div>
      <div className="head-actions">
        <button className="btn btn-primary" type="submit" disabled={state === "saving" || name.trim() === initial.trim()}>
          {state === "saving" ? "Salvando…" : "Salvar nome"}
        </button>
        {state === "saved" && <span className="hint" role="status" style={{ alignSelf: "center" }}>Nome salvo.</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

function PasswordForm({ onSave, verify, hasPassword, disabled }: { onSave: (password: string) => Promise<void>; verify: (password: string) => Promise<void>; hasPassword: boolean; disabled: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("As duas senhas precisam ser iguais.");
      return;
    }
    setState("saving");
    setError(null);
    try {
      if (hasPassword) {
        try {
          await verify(current);
        } catch {
          setError("A senha atual está incorreta.");
          setState("idle");
          return;
        }
      }
      await onSave(password);
      setCurrent("");
      setPassword("");
      setConfirm("");
      setState("saved");
    } catch (err) {
      setError(authErrorMessage(err));
      setState("idle");
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>{hasPassword ? "Trocar senha" : "Criar uma senha"}</h2>
      {disabled && <p className="hint">Indisponível no modo demonstração.</p>}
      {!hasPassword && <p className="hint">Você entrou com o Google. Se quiser, crie uma senha para também poder entrar com e-mail.</p>}
      {hasPassword && (
        <div className="field">
          <label htmlFor="p-current">Senha atual</label>
          <PasswordInput id="p-current" required autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setState("idle"); }} disabled={disabled} />
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="p-pass">Nova senha</label>
          <PasswordInput id="p-pass" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setState("idle"); }} disabled={disabled} />
        </div>
        <div className="field">
          <label htmlFor="p-pass2">Repita a nova senha</label>
          <PasswordInput id="p-pass2" minLength={8} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={disabled} />
        </div>
      </div>
      <p className="hint">Pelo menos 8 caracteres.</p>
      <div className="head-actions">
        <button className="btn btn-primary" type="submit" disabled={disabled || state === "saving"}>
          {state === "saving" ? "Salvando…" : "Salvar nova senha"}
        </button>
        {state === "saved" && <span className="hint" role="status" style={{ alignSelf: "center" }}>Senha alterada.</span>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}


function SharePanel() {
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
  const error = (share.error ?? enable.error ?? renew.error ?? disable.error) as Error | null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel">
      <h2>Compartilhar minha estante</h2>
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
          <div className="head-actions">
            <button className="btn btn-primary" onClick={copy}>{copied ? "Link copiado" : "Copiar link"}</button>
            <button
              className="btn btn-ghost"
              disabled={renew.isPending}
              onClick={() => confirm("Gerar um link novo? O link atual deixa de funcionar.") && renew.mutate()}
            >
              Gerar novo link
            </button>
            <button className="btn btn-ghost" disabled={disable.isPending} onClick={() => disable.mutate()}>
              Parar de compartilhar
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={enable.isPending || share.isLoading} onClick={() => enable.mutate()}>
          Criar link para compartilhar
        </button>
      )}
      {error && <p className="error" role="alert">{share.error ? "O compartilhamento ainda não foi ativado neste servidor." : error.message}</p>}
    </section>
  );
}
