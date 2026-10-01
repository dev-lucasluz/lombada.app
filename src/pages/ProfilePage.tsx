import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { authErrorMessage, useAuth } from "../lib/auth";
import { listCollection, listReading } from "../lib/db";
import { missingVolumes } from "../lib/ranges";
import { isStandalone } from "../components/BookShelf";
import { isDemo } from "../lib/demo";
import { ThemeToggle } from "../components/ThemeToggle";
import "./pages.css";
import "./ProfilePage.css";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** Aspas e quebras de linha escapadas para CSV (Excel em português usa ponto e vírgula). */
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function ProfilePage() {
  const { session, updateName, updatePassword, signOut } = useAuth();
  const user = session?.user;
  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });
  const reading = useQuery({ queryKey: ["reading"], queryFn: listReading });

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

  return (
    <div className="page profile">
      <header className="page-head">
        <div>
          <h1>Perfil</h1>
        </div>
      </header>

      <section className="profile-card">
        <span className="profile-avatar" aria-hidden="true">{displayName.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>
        <div className="profile-id">
          <strong>{displayName}</strong>
          <span>{user?.email ?? ""}</span>
          {memberSince && <small>No Lombada desde {memberSince}</small>}
        </div>
      </section>

      <section className="panel profile-summary" aria-labelledby="summary-title">
        <h2 id="summary-title">Resumo da coleção</h2>
        <ul className="profile-stats">
          <li className="is-main"><span className="num">{collection.data ? volumes : "–"}</span><small>volumes e livros no total</small></li>
          <li><span className="num">{collection.data ? series.length : "–"}</span><small>séries de mangá</small></li>
          <li><span className="num">{collection.data ? books.length : "–"}</span><small>livros avulsos</small></li>
          <li><span className="num">{collection.data ? complete.length : "–"}</span><small>coleções completas</small></li>
          <li><span className="num">{collection.data ? missing : "–"}</span><small>volumes faltando</small></li>
          <li><span className="num">{reading.data?.length ?? "–"}</span><small>mangás em "Onde parei"</small></li>
        </ul>
        {items.length > 0 && (
          <p className="hint">
            Maior coleção: <strong>{biggest.edition.work.title}</strong> ({biggest.owned.length} volumes). Última adição:{" "}
            <strong>{latest.edition.work.title}</strong>.
          </p>
        )}
      </section>

      <div className="profile-grid">
        <NameForm initial={(user?.user_metadata?.full_name as string | undefined) ?? ""} onSave={updateName} />

        <section className="panel">
          <h2>Aparência</h2>
          <p className="hint">Tema claro ou escuro, salvo neste aparelho.</p>
          <ThemeToggle className="btn btn-ghost" withLabel />
        </section>

        <PasswordForm onSave={updatePassword} disabled={isDemo} />

        <section className="panel">
          <h2>Seus dados</h2>
          <p className="hint">
            Baixe a sua coleção em uma planilha (CSV) que abre no Excel e no Google Planilhas. Para apagar a conta e
            todos os dados, peça pelo e-mail da <a href="/privacidade">política de privacidade</a>.
          </p>
          <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={exportCsv} disabled={!collection.data?.length}>
            Baixar coleção (CSV)
          </button>
        </section>

        <section className="panel profile-signout">
          <h2>Sair da conta</h2>
          <p className="hint">Encerra a sessão neste aparelho. Seus dados continuam salvos.</p>
          <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={signOut}>
            Sair
          </button>
        </section>
      </div>
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

function PasswordForm({ onSave, disabled }: { onSave: (password: string) => Promise<void>; disabled: boolean }) {
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
      await onSave(password);
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
      <h2>Trocar senha</h2>
      {disabled && <p className="hint">Indisponível no modo demonstração.</p>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="p-pass">Nova senha</label>
          <input id="p-pass" className="input" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setState("idle"); }} disabled={disabled} />
        </div>
        <div className="field">
          <label htmlFor="p-pass2">Repita a nova senha</label>
          <input id="p-pass2" className="input" type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={disabled} />
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

