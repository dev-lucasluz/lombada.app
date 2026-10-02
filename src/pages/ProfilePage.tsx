import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { authErrorMessage, useAuth } from "../lib/auth";
import { getMyAvatar, isAdmin, listCollection, listFeedback, listReading, setMyAvatar } from "../lib/db";
import { missingVolumes } from "../lib/ranges";
import { isStandalone } from "../components/BookShelf";
import { Icon } from "../components/Icon";
import { isDemo } from "../lib/demo";
import { useAvatar } from "../lib/useAvatar";
import { prepareAvatar } from "../lib/quickAdd";
import { seriesHues, volumeColor } from "../lib/spineColor";
import { PasswordInput } from "../components/PasswordInput";
import { ShareControls } from "../components/ShareControls";
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
  const feedbackList = useQuery({ queryKey: ["feedback"], queryFn: listFeedback, enabled: admin.data === true });
  const newFeedback = feedbackList.data?.filter((f) => f.status === "novo").length ?? 0;

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

  const qc = useQueryClient();
  const avatarUrl = useAvatar();
  const customPhoto = useQuery({ queryKey: ["profile-avatar"], queryFn: getMyAvatar, staleTime: 5 * 60_000 });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const savePhoto = useMutation({
    mutationFn: async (file: File | null) => setMyAvatar(file ? await prepareAvatar(file) : null),
    onSuccess: () => {
      setPhotoError(null);
      qc.invalidateQueries({ queryKey: ["profile-avatar"] });
    },
    onError: (err) => setPhotoError(err instanceof Error ? err.message : "Não foi possível salvar a foto."),
  });
  const hasPassword = ((user?.app_metadata?.providers as string[] | undefined) ?? ["email"]).includes("email");

  return (
    <div className="page profile">
      <section className="profile-hero" aria-labelledby="profile-name">
        <div className="profile-hero-top">
          <div className="profile-who">
            <div className="profile-photo">
              <label className="profile-photo-pick" title="Trocar a foto">
                <Avatar url={avatarUrl} name={displayName} />
                <span className="profile-photo-badge" aria-hidden="true"><Icon name="camera" size={16} /></span>
                <span className="visually-hidden">Trocar a foto do perfil</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="visually-hidden"
                  disabled={isDemo || savePhoto.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) savePhoto.mutate(file);
                  }}
                />
              </label>
            </div>
            <div className="profile-id">
              <h1 id="profile-name">{displayName}</h1>
              <span>{user?.email ?? ""}</span>
              {memberSince && <small>No Lombada desde {memberSince}</small>}
              {savePhoto.isPending && <small role="status">Salvando a foto…</small>}
              {photoError && <small className="error" role="alert">{photoError}</small>}
              {customPhoto.data && !savePhoto.isPending && (
                <button type="button" className="profile-photo-remove" onClick={() => savePhoto.mutate(null)}>Remover foto</button>
              )}
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

      <section className="profile-share" aria-labelledby="share-heading">
        <h2 id="share-heading">Compartilhar minha estante</h2>
        <ShareControls />
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
        </div>

        <div className="profile-group">
          <h2>Dados</h2>
          <div className="profile-row">
            <div>
              <strong>Baixar a coleção</strong>
              <span className="hint">
                Planilha (CSV) que abre no Excel e no Google Planilhas. Para apagar a conta e todos os dados, peça pelo
                e-mail da <Link to="/privacidade">política de privacidade</Link>.
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
              <Link to="/admin" className="btn btn-ghost">
                {newFeedback > 0 ? `Ver feedbacks (${newFeedback} ${newFeedback === 1 ? "nova" : "novas"})` : "Ver feedbacks"}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="profile-leave">
        <span className="hint">Sair encerra a sessão neste aparelho. Seus dados continuam salvos.</span>
        <button className="btn btn-ghost" onClick={signOut}>Sair da conta</button>
      </div>
    </div>
  );
}

/** Foto da conta Google; sem foto (ou se ela falhar ao carregar), a inicial do nome. */
function Avatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        className="profile-avatar is-photo"
        src={url}
        alt={`Foto de ${name}`}
        width={72}
        height={72}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="profile-avatar" aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>;
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
