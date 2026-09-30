import { useState, type CSSProperties, type FormEvent } from "react";
import { authErrorMessage, useAuth } from "../lib/auth";
import "./LoginPage.css";

// Prateleira de exemplo: alturas variadas e três vãos para mostrar "o que falta".
const DEMO = [
  { h: 92, hue: 262 }, { h: 88, hue: 262 }, { h: 92, hue: 262 }, { h: 0, hue: 0 },
  { h: 90, hue: 262 }, { h: 94, hue: 28 }, { h: 94, hue: 28 }, { h: 94, hue: 28 },
  { h: 0, hue: 0 }, { h: 0, hue: 0 }, { h: 86, hue: 160 }, { h: 86, hue: 160 },
  { h: 88, hue: 160 }, { h: 86, hue: 160 }, { h: 96, hue: 340 }, { h: 96, hue: 340 },
];

export function LoginPage() {
  return (
    <div className="login">
      <div className="login-copy">
        <span className="login-brand">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          Lombada
        </span>
        <h1>Sua estante, volume por volume.</h1>
        <p>
          Marque os mangás e livros físicos que você tem, veja na hora quais volumes faltam e
          guarde em que capítulo parou de ler online.
        </p>
        <AuthPanel />
        <p className="login-legal">
          Ao entrar, você concorda com os <a href="/termos">termos de uso</a> e a{" "}
          <a href="/privacidade">política de privacidade</a>.
        </p>
      </div>

      <div className="login-art" aria-hidden="true">
        <div className="login-shelf">
          {DEMO.map((s, i) => (
            <span
              key={i}
              className={s.h ? "login-spine" : "login-spine is-gap"}
              style={{ "--h": `${s.h || 80}%`, "--hue": s.hue, "--i": i } as CSSProperties}
            >
              <span className="num">{i + 1}</span>
            </span>
          ))}
        </div>
        <p className="login-caption">
          <span>Tem 1–3, 5–8, 11–16</span>
          <span className="login-missing">Faltam 4, 9–10</span>
        </p>
      </div>
    </div>
  );
}

type Mode = "signin" | "signup" | "forgot";

const MODE_SUBMIT: Record<Mode, string> = {
  signin: "Entrar",
  signup: "Criar conta",
  forgot: "Enviar link",
};

function AuthPanel() {
  const { signInWithPassword, signUp, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        await signInWithPassword(form.email.trim(), form.password);
      } else if (mode === "signup") {
        const needsConfirmation = await signUp(form.name.trim(), form.email.trim(), form.password);
        if (needsConfirmation) {
          setNotice(`Enviamos um link de confirmação para ${form.email.trim()}. Abra o e-mail para ativar a conta.`);
        }
      } else {
        await sendPasswordReset(form.email.trim());
        setNotice(`Se existir uma conta com ${form.email.trim()}, você vai receber um link para criar uma nova senha.`);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "signup" && (
          <div className="field">
            <label htmlFor="auth-name">Nome</label>
            <input id="auth-name" className="input" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-email">E-mail</label>
          <input id="auth-email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        {mode !== "forgot" && (
          <div className="field">
            <label htmlFor="auth-password">Senha</label>
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {mode === "signup" && <span className="auth-hint">Pelo menos 8 caracteres.</span>}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Aguarde…" : MODE_SUBMIT[mode]}
        </button>

        {error && <p className="login-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
      </form>

      <div className="auth-switch">
        {mode === "signin" && (
          <>
            <button type="button" onClick={() => switchTo("signup")}>Criar conta</button>
            <button type="button" onClick={() => switchTo("forgot")}>Esqueci a senha</button>
          </>
        )}
        {mode !== "signin" && (
          <button type="button" onClick={() => switchTo("signin")}>Já tenho conta: entrar</button>
        )}
      </div>
    </div>
  );
}

/** Mostrada quando a pessoa abre o link de redefinição de senha recebido por e-mail. */
export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-copy">
        <span className="login-brand">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          Lombada
        </span>
        <h1>Crie uma nova senha</h1>
        <form className="auth auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="new-password">Nova senha</label>
            <input id="new-password" className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="auth-hint">Pelo menos 8 caracteres.</span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova senha"}
          </button>
          {error && <p className="login-error" role="alert">{error}</p>}
        </form>
      </div>
    </div>
  );
}
