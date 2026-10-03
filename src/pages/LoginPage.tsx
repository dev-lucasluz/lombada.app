import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { authErrorMessage, useAuth } from "../lib/auth";
import { ThemeToggle } from "../components/ThemeToggle";
import { PasswordInput } from "../components/PasswordInput";
import { Icon, type IconName } from "../components/Icon";
import "./LoginPage.css";

// Estante de exemplo. Em cima, uma série de mangá com volumes faltando (4, 9 e 10);
// embaixo, livros avulsos com títulos em inglês e japonês e uma pilha deitada.
const SERIES_MISSING = new Set([4, 9, 10]);
const SERIES = Array.from({ length: 10 }, (_, i) => i + 1);

const LOOSE_BOOKS: { title: string; hue: number; h: number; jp?: boolean }[] = [
  { title: "ATLAS", hue: 250, h: 84 },
  { title: "物語", hue: 330, h: 92, jp: true },
  { title: "POEMS", hue: 140, h: 76 },
  { title: "NOVEL", hue: 60, h: 96 },
  { title: "夢", hue: 200, h: 80, jp: true },
  { title: "HISTORY", hue: 25, h: 90 },
];

/**
 * Resumo do que existe dentro do app. Atualize esta lista sempre que uma
 * funcionalidade entrar (tire o `soon`) ou for planejada.
 */
const FEATURES: { icon: IconName; title: string; text: string; soon?: boolean }[] = [
  { icon: "shelf", title: "Coleção por edição", text: "Marque os volumes que tem e veja na hora quais faltam." },
  { icon: "search", title: "Busca no catálogo", text: "Capa, autor e total de volumes de mangás e livros vêm prontos." },
  { icon: "list", title: "Lista de compras", text: "Tudo o que falta, série por série, para levar à loja." },
  { icon: "book", title: "Onde parei", text: "Anote o capítulo em que parou nos mangás que lê em outros sites." },
  { icon: "bell", title: "Lembretes", text: "Marque um dia, como a volta de um hiato, e ele aparece no seu Início." },
  { icon: "camera", title: "Foto da estante", text: "Fotografe a prateleira ou as capas e o app lê tudo para você revisar." },
  { icon: "mic", title: "Cadastro por voz", text: "Diga “tenho Naruto do 1 ao 10” e revise antes de salvar." },
  { icon: "book", title: "Séries de livros", text: "Livros com títulos diferentes, como Harry Potter, ficam juntos na estante." },
  { icon: "share", title: "Estante compartilhada", text: "Mande um link para os amigos verem a sua coleção, sem precisar de conta." },
  { icon: "user", title: "Perfil e backup", text: "Veja o resumo da coleção e baixe tudo em uma planilha." },
];

/**
 * Estante animada. No PC aparece grande ao lado do formulário; no celular,
 * a versão `mini` fica no topo para caber na primeira tela sem rolar.
 */
function Bookcase({ className, mini = false }: { className: string; mini?: boolean }) {
  return (
    <div className={className} aria-hidden="true">
      <div className={mini ? "case is-mini" : "case"}>
        <div className="case-row">
          {SERIES.map((n, i) =>
            SERIES_MISSING.has(n) ? (
              <span key={n} className="case-book is-gap" style={{ "--i": i } as CSSProperties}>
                <span className="case-plus">+</span>
                <span className="num">{n}</span>
              </span>
            ) : (
              <span key={n} className="case-book" style={{ "--h": "94%", "--hue": 264, "--i": i } as CSSProperties}>
                <span className="case-title is-jp">冒険</span>
                <span className="num">{n}</span>
              </span>
            ),
          )}
        </div>
        <div className="case-row">
          {LOOSE_BOOKS.map((b, i) => (
            <span
              key={b.title}
              className="case-book is-loose"
              style={{ "--h": `${b.h}%`, "--hue": b.hue, "--i": i + 10 } as CSSProperties}
            >
              <span className={b.jp ? "case-title is-jp" : "case-title"}>{b.title}</span>
            </span>
          ))}
          <span className="case-stack" style={{ "--i": 16 } as CSSProperties}>
            <span style={{ "--hue": 300, width: "92%" } as CSSProperties} />
            <span style={{ "--hue": 90, width: "100%" } as CSSProperties} />
            <span style={{ "--hue": 30, width: "84%" } as CSSProperties} />
          </span>
        </div>
      </div>
      <p className="login-caption">
        <span>Tem 1–3, 5–8</span>
        <span className="login-missing">Faltam 4, 9–10</span>
      </p>
    </div>
  );
}

/** Acompanha uma media query (ex.: celular, ou preferência por menos movimento). */
function useMediaQuery(query: string) {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    // Reforço: alguns navegadores só avisam a mudança na hora de desenhar; o resize cobre o intervalo.
    window.addEventListener("resize", onChange);
    onChange();
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, [query]);
  return matches;
}

/** O aparelho pediu para economizar dados (modo "economia de dados" do navegador). */
function wantsLessData() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/** Quantas vezes o vídeo toca antes de parar no último quadro (poupa bateria e processador). */
const INTRO_PLAYS = 3;

/**
 * Vídeo de apresentação do app (15 s). Toca sozinho e sem som, 3 vezes, e fica parado no último quadro (o logo).
 * Sem o vídeo (erro de rede), com preferência por menos movimento ou com economia de dados, usa a estante animada.
 */
function IntroVideo({ className, mini = false }: { className: string; mini?: boolean }) {
  const [failed, setFailed] = useState(false);
  const plays = useRef(0);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (failed || reduced || wantsLessData()) return <Bookcase className={className} mini={mini} />;

  return (
    <div className={`${className} login-video`}>
      <video
        src="/media/login-intro-1.mp4"
        poster="/media/login-intro-1.webp"
        autoPlay
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        onEnded={(event) => {
          plays.current += 1;
          if (plays.current < INTRO_PLAYS) {
            event.currentTarget.currentTime = 0;
            void event.currentTarget.play().catch(() => {});
          }
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function LoginPage() {
  // Só um dos dois lugares do vídeo existe por vez (celular: ao lado do título; PC: ao lado do formulário).
  const mobile = useMediaQuery("(max-width: 899px)");
  return (
    <div className="login">
      <ThemeToggle className="btn btn-ghost login-theme" />
      <div className="login-copy">
        <span className="login-brand">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          Lombada
        </span>
        <div className="login-hero">
          <h1>Sua estante, volume por volume.</h1>
          {mobile && <IntroVideo className="login-art login-art-mini" mini />}
        </div>
        <p>Para quem coleciona mangás e livros físicos e quer lembrar onde parou de ler.</p>
        <AuthPanel />
        <p className="login-legal">
          Ao entrar, você concorda com os <a href="/termos">termos de uso</a> e a{" "}
          <a href="/privacidade">política de privacidade</a>.
        </p>
      </div>

      <div className="login-side">
        {!mobile && <IntroVideo className="login-art login-art-full" />}

        <section className="login-features" aria-labelledby="features-title">
          <h2 id="features-title">O que tem no app</h2>
          <ul>
            {FEATURES.map((f) => (
              <li key={f.title}>
                <Icon name={f.icon} size={20} />
                <div>
                  <strong>
                    {f.title}
                    {f.soon && <span className="login-soon">Em breve</span>}
                  </strong>
                  <span>{f.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

type Mode = "signin" | "signup" | "forgot";

/** Os e-mails de conta costumam cair no spam nos primeiros envios (remetente novo). */
const SPAM_HINT = "Não chegou em alguns minutos? Veja a caixa de spam ou de lixo eletrônico e marque como “não é spam”.";

const MODE_SUBMIT: Record<Mode, string> = {
  signin: "Entrar",
  signup: "Criar conta",
  forgot: "Enviar link",
};

/**
 * Links de e-mail com problema voltam para o app com o erro na URL
 * (ex.: #error_code=otp_expired). Lê uma vez e limpa a URL.
 */
function readLinkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get("error_code");
  if (!code) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return code === "otp_expired"
    ? "Esse link já foi usado ou expirou. Tente entrar: sua conta pode já estar confirmada. Se pedir confirmação, reenvie o e-mail."
    : "O link do e-mail não funcionou. Tente entrar ou peça um novo link.";
}

/** Logo "G" do Google (as quatro cores oficiais), exigida no botão de login. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AuthPanel() {
  const { signInWithPassword, signUp, signInWithGoogle, sendPasswordReset, resendConfirmation } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(readLinkError);
  // Mostra "Reenviar confirmação" quando a conta existe mas ainda não foi confirmada.
  const [canResend, setCanResend] = useState(false);

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCanResend(false);
  };

  const handleResend = async () => {
    setBusy(true);
    setError(null);
    try {
      await resendConfirmation(form.email.trim());
      setNotice(`Enviamos um novo link de confirmação para ${form.email.trim()}. Use o link mais recente. ${SPAM_HINT}`);
      setCanResend(false);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signInWithGoogle(); // a página é trocada pela tela do Google
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
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
          setNotice(`Enviamos um link de confirmação para ${form.email.trim()}. Abra o e-mail para ativar a conta. ${SPAM_HINT}`);
          setCanResend(true);
        }
      } else {
        await sendPasswordReset(form.email.trim());
        setNotice(`Se existir uma conta com ${form.email.trim()}, você vai receber um link para criar uma nova senha. ${SPAM_HINT}`);
      }
    } catch (err) {
      setError(authErrorMessage(err));
      if ((err as { code?: string }).code === "email_not_confirmed") setCanResend(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      {mode !== "forgot" && (
        <>
          <button type="button" className="btn btn-ghost auth-google" onClick={handleGoogle} disabled={busy}>
            <GoogleLogo />
            Continuar com Google
          </button>
          <p className="auth-or"><span>ou use e-mail e senha</span></p>
        </>
      )}
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
            <PasswordInput
              id="auth-password"
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
        {canResend && form.email && (
          <button type="button" className="btn btn-ghost" onClick={handleResend} disabled={busy}>
            Reenviar e-mail de confirmação
          </button>
        )}
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
            <PasswordInput id="new-password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
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
