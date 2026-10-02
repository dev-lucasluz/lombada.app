# Lombada — instruções para o agente

App de coleção de mangás/livros físicos e histórico de leitura online. Leia [PLANO.md](PLANO.md) para o escopo e as fases; o checklist de fases de lá deve ser atualizado ao concluir cada uma.

## Restrições do usuário (não negociáveis)
- **Custo zero.** Não adicione serviço pago nem dependência que exija plano pago. Hospedagem é Cloudflare (Pages + Workers), não Vercel.
- **Sem verificação automática de capítulos novos** (MangaDex ou scraping). Lembretes são só por data, definidos pelo usuário.
- Interface em **português do Brasil**, responsiva: celular, tablet e PC têm o mesmo peso.
- Fotos da estante **não são armazenadas**.
- **Login por e-mail e senha e, a partir da 1.2, também pelo Google** (usuário pediu de volta em 2026-10-01; OAuth configurado no Google Cloud e no Supabase, só e-mail/perfil/openid). E-mails de conta saem pelo SMTP do Gmail configurado no Supabase; não há domínio próprio, então Brevo/Resend não servem.

- **Versão 1.4 publicada (2026-10-02; 1.0 a 1.3 vieram antes).** Atualizações seguem 1.1, 1.2, 1.3… **Nunca fazer `git push` sem o usuário autorizar** (o push publica no site na hora). Pergunte antes e diga a versão.

## Stack e arquitetura
- React 19 + Vite + TypeScript, React Router, TanStack Query. SPA estática.
- Supabase acessado direto do navegador (`src/lib/supabase.ts`); a segurança é por RLS em `supabase/migrations/`. Toda tabela nova precisa de RLS e política.
- Consultas ficam em `src/lib/db.ts` (tipos espelham o SQL). Páginas não chamam `supabase.from` diretamente.
- Segredos só em `worker/` (Worker da Cloudflare: `worker/index.ts` roteia `/api/*`, handlers em `worker/api/`) e `workers/reminders/` (Worker com cron). Nunca a secret key (`sb_secret_...`) no front.
- Catálogo externo sem chave: AniList (mangá) e Open Library (livro; Google Books só como reserva, porque sem chave a cota é compartilhada e vive esgotada), em `src/lib/catalog.ts`.
- Modelo de dados: `works` (obra) → `editions` (edição BR, privada de quem cadastrou desde a migração 0008; só o criador a vê e edita) → `collections` (usuário tem a edição) → `owned_volumes`.

## Design
- Tokens em `src/styles/global.css` (cores, escala tipográfica, raios). Use as variáveis; não crie cores soltas. Tema claro e escuro: todo token novo precisa dos dois valores (bloco `prefers-color-scheme` e `[data-theme="dark"]`). O botão `ThemeToggle` salva a escolha em `localStorage`.
- Paleta: off-white `--paper` e cinza quase preto `--ink`. Amarelo `--action` só para o botão principal; `--marker` (mesmo amarelo) para realce de "o que falta", hiato, completa. Laranja claro `--accent` (tom do Claude, pedido do usuário) para links, foco e item ativo. Tema claro é acinzentado de propósito (usuário acha branco puro cansativo): não usar #fff em fundos. O usuário pediu referência no Claude (escuro + off-white), mas **não** quer bege/terracota nem cópia do Claude.
- Tipos (hospedadas em `public/fonts`, pré-carregadas no `index.html`): Zen Kaku Gothic New bold nos títulos do app (`--font-heading`); Anybody condensada só na marca, no título do login e nos números (`.num`); Geist no texto. O usuário pediu para tirar a Anybody dos títulos internos.
- Elemento central: lombadas (`src/components/Shelf.tsx`). Séries com mais de 40 volumes (`isLongSeries`) quebram a faixa em várias prateleiras (40 por prateleira; 60 no bloco largo a partir de 700px) e o card ocupa a linha inteira da grade (`is-wide`, `grid-auto-flow: dense`). Volume que tem = lombada colorida (`spineColor(edition.id)`: tom vivo por série; o usuário rejeitou usar a cor da capa); falta = vão tracejado. O ícone (fundo cinza; livro amarelo com "BOOK", livro verde com 漫画, vão tracejado laranja) é aprovado pelo usuário: não trocar.
- Início (`HomePage`) em blocos de tamanhos diferentes. Único ornamento: retícula de mangá (`--halftone`) no bloco "Foto da estante". Não espalhar a retícula.
- Evitar: rótulos em CAIXA ALTA, cards idênticos com sombra, animações de entrada em cada seção. A única animação decorativa é a estante do login (móvel com duas prateleiras: série de mangá com volumes faltando em cima, livros avulsos embaixo).
- **Tela de login lista o que o app faz** (`FEATURES` em `src/pages/LoginPage.tsx`). Toda funcionalidade nova ou planejada entra ali; ao concluir, tirar o `soon: true`.
- Navegação: no celular o dock tem Início, Coleção, Onde parei, Lembretes e **Perfil** (Foto e voz sai do dock e fica nos botões do Início); **não há botão Sair solto nas páginas** — Sair fica só no Perfil. No PC a barra lateral tem Foto e voz, e Perfil/Tema/Sair embaixo. Perfil: `src/pages/ProfilePage.tsx` (nome, resumo da coleção, trocar senha, exportar CSV).
- Textos: verbos claros nos botões ("Salvar leitura", não "Enviar"); erros dizem o que houve e o que fazer.

## Segurança (auditada em 2026-10-01)
- Nada secreto no navegador: só a chave publishable do Supabase e a chave do Google Books (restrita por referrer e API). `GEMINI_API_KEY` só existe como Secret do Worker. `.env.production` guarda apenas valores públicos; nunca colocar `sb_secret_`/Gemini ali.
- Banco: RLS em todas as tabelas; sem login nada é lido nem gravado (testado). Migrações `0001` a `0004` já executadas (`0005` +18, `0006`–`0007` feedback/admin, `0008` edições privadas, `0009` link da estante, `0010` aviso de feedback, `0011` foto no feedback, `0012` foto de perfil, `0013` capa manual, `0014` cota restante; admin = tabela `admins`, página `/admin`) no Supabase (a `0004` restringe quem edita edições compartilhadas; confirmada pelo usuário em 2026-10-01).
- Site: `public/_headers` define nosniff, X-Frame-Options, Referrer-Policy `strict-origin-when-cross-origin` (NÃO usar `no-referrer`: a restrição da chave do Google Books depende do referrer), Permissions-Policy e uma CSP mínima. Uma CSP completa não foi aplicada de propósito (script inline do tema no index.html, risco de quebrar capas/APIs).
- Reaudite com: varrer todos os chunks de `dist/assets` por `sb_secret_`, `service_role`, JWT e `GEMINI`; sondar tabelas com a chave publishable (todas devem devolver `[]`).

## Comandos
- `npm run dev` — front em http://localhost:5173
- `npm run build` — typecheck (`tsc -b`) + build. Rode antes de dar uma tarefa por concluída.
- `npm run pages:dev` — build + Worker (foto e voz, `wrangler dev`) em http://localhost:8788; com ele aberto, o `npm run dev` repassa `/api` para lá
- `npm run dev:demo` — **modo demonstração** em http://localhost:5174: pula o login e usa dados de exemplo no navegador (`src/lib/demo.ts`), para testar as telas internas sem conta. Voz usa um interpretador local simples; foto não funciona nesse modo. Só existe em desenvolvimento (`import.meta.env.DEV`); confira com `grep -r lombada-demo dist/` após o build que nada vazou.

## Próximos passos (em ordem)
1. **Fase 1 — validar com Supabase real**: testar login, busca, criar edição, marcar volumes, lista de compras. Corrigir o que aparecer.
2. **Fase 2 — lembretes por web push**: service worker + manifest (PWA), salvar inscrição em `push_subscriptions`, enviar pelo Worker de lembretes (chaves VAPID; usar lib compatível com Workers, ex. `@block65/webcrypto-web-push`). Web push é o canal principal. O envio por Brevo em `workers/reminders/index.ts` não funciona sem domínio: substituir por web push e deixar e-mail desativado. Mostrar também os lembretes vencidos na tela inicial.
3. **Fase 3 — foto e voz (implementada)**: tela `QuickAddPage` (`/foto-e-voz`), lógica em `src/lib/quickAdd.ts`, voz em `src/lib/speech.ts`, funções `worker/api/scan-shelf.ts` e `parse-voice.ts` com base comum em `server/ai.ts`. Foto e voz já foram testadas pelo usuário e funcionam; ajustar os prompts/`GEMINI_MODEL` só se a precisão cair.
4. **Fase 4 — extras**: ISBN por câmera, empréstimos (`owned_volumes.loaned_to`), estatísticas, exportar CSV.
