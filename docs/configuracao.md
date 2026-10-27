# Configuração (uma vez só)

Passo a passo para publicar o seu próprio Lombada. Voltar ao [README](../README.md).

## 1. Supabase (banco + login)
1. Crie uma conta em supabase.com e um projeto novo (região São Paulo).
2. **SQL Editor** → cole o conteúdo de `supabase/migrations/0001_schema.sql` → **Run**.
3. Preencha o `.env.local`:
   - `VITE_SUPABASE_URL`: `https://<Project ID>.supabase.co` (o Project ID fica em **Project Settings → General**).
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: a chave `sb_publishable_...` em **Project Settings → API Keys**.

## 2. Login (e-mail e senha)
O e-mail padrão do Supabase só entrega para os membros do projeto e tem limite de poucos envios por hora, então amigos não receberiam a confirmação de conta. Sem domínio próprio, a opção grátis é o SMTP do Gmail (cerca de 500 e-mails/dia por conta). A Brevo foi descartada porque exige domínio autenticado.
1. Na conta Gmail que vai enviar: ative a **verificação em duas etapas** e gere uma **senha de app** em myaccount.google.com/apppasswords.
2. No Supabase: **Authentication → Emails → SMTP Settings** → ative *Custom SMTP*:
   - Host `smtp.gmail.com`, porta `587`
   - Username e Sender email: o endereço Gmail completo
   - Password: a senha de app (16 letras). Se a senha da conta Google mudar, gere outra.
   - Sender name: `Lombada`
3. Em **Authentication → Emails → Templates**, cole os modelos em português de `supabase/templates/`:
   - *Confirm signup* ← `confirmacao.html` (assunto: `Confirme sua conta no Lombada`)
   - *Reset password* ← `redefinir-senha.html` (assunto: `Crie uma nova senha no Lombada`)
4. Em **Authentication → URL Configuration**:
   - *Site URL*: a URL de produção (ex.: `https://lombada.pages.dev`)
   - *Redirect URLs*: adicione `http://localhost:5173` e a URL de produção.

## 3. Cloudflare (Workers + site estático, ligado ao GitHub)
1. Em dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → escolha o repositório. Cada `git push` na `main` publica sozinho.
2. Comandos: build `npm run build`, deploy `npx wrangler deploy` (o `wrangler.toml` já configura tudo).
3. **Settings → Build → Variables and secrets** (usadas só na hora do build; ficam embutidas no site e são públicas):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_BOOKS_API_KEY`
4. **Settings → Variables and secrets** do Worker (usadas pelas rotas `/api`):
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY` (tipo *Secret*), `GEMINI_MODEL`, `SCAN_DAILY_LIMIT`
5. Depois de publicar: no Supabase, troque a *Site URL* e adicione o endereço em *Redirect URLs*; na chave do Google Books, adicione `https://SEU-ENDERECO/*`.

## 4. Gemini (foto e voz)
1. aistudio.google.com → **Get API key** → crie a chave (grátis, sem cartão).
2. Local: cole em `.dev.vars` (`GEMINI_API_KEY=`). Produção: variável secreta `GEMINI_API_KEY` no Worker da Cloudflare.
3. Veja os limites da sua conta em aistudio.google.com/rate-limit e ajuste `SCAN_DAILY_LIMIT` (cota por pessoa por dia, somando foto e voz).
4. Se o modelo padrão (`gemini-flash-lite-latest`) errar muito nas lombadas, troque `GEMINI_MODEL` por um Flash maior.

## 5. Lembretes (fase 2)
O aviso principal é por notificação no aparelho (web push, grátis). E-mail de lembrete fica para quando houver domínio próprio.
1. Em `workers/reminders/`: `npx wrangler deploy` e cadastre os segredos listados no `wrangler.toml`.
   A `SUPABASE_SECRET_KEY` é uma chave `sb_secret_...` criada em **Project Settings → API Keys → Secret keys**. Nunca use essa chave no front.
