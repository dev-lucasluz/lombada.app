# Lombada — instruções para o agente

App de coleção de mangás/livros físicos e histórico de leitura online. Leia [PLANO.md](PLANO.md) para o escopo e as fases; o checklist de fases de lá deve ser atualizado ao concluir cada uma.

## Restrições do usuário (não negociáveis)
- **Custo zero.** Não adicione serviço pago nem dependência que exija plano pago. Hospedagem é Cloudflare (Pages + Workers), não Vercel.
- **Sem verificação automática de capítulos novos** (MangaDex ou scraping). Lembretes são só por data, definidos pelo usuário.
- Interface em **português do Brasil**, responsiva: celular, tablet e PC têm o mesmo peso.
- Fotos da estante **não são armazenadas**.
- **Login só por e-mail e senha** (Google foi removido a pedido). E-mails de conta saem pelo SMTP do Gmail configurado no Supabase; não há domínio próprio, então Brevo/Resend não servem.

## Stack e arquitetura
- React 19 + Vite + TypeScript, React Router, TanStack Query. SPA estática.
- Supabase acessado direto do navegador (`src/lib/supabase.ts`); a segurança é por RLS em `supabase/migrations/`. Toda tabela nova precisa de RLS e política.
- Consultas ficam em `src/lib/db.ts` (tipos espelham o SQL). Páginas não chamam `supabase.from` diretamente.
- Segredos só em `functions/` (Pages Functions) e `workers/reminders/` (Worker com cron). Nunca a secret key (`sb_secret_...`) no front.
- Catálogo externo sem chave: AniList (mangá) e Google Books (livro), em `src/lib/catalog.ts`.
- Modelo de dados: `works` (obra) → `editions` (edição BR, compartilhada e editável) → `collections` (usuário tem a edição) → `owned_volumes`.

## Design
- Tokens em `src/styles/global.css` (cores, escala tipográfica, raios). Use as variáveis; não crie cores soltas.
- Tipos: Anybody (títulos e números, via `.num`) e Atkinson Hyperlegible Next (texto).
- Elemento central: lombadas (`src/components/Shelf.tsx`). Volume que tem = lombada colorida (`spineColor(edition.id)`); falta = vão tracejado. O amarelo `--marker` é só para destaque pontual (o que falta, hiato, coleção completa).
- Evitar: rótulos em CAIXA ALTA, cards idênticos com sombra, animações de entrada em cada seção. A única animação decorativa é a prateleira do login.
- Textos: verbos claros nos botões ("Salvar leitura", não "Enviar"); erros dizem o que houve e o que fazer.

## Comandos
- `npm run dev` — front em http://localhost:5173
- `npm run build` — typecheck (`tsc -b`) + build. Rode antes de dar uma tarefa por concluída.
- `npm run pages:dev` — front + Functions em http://localhost:8788

## Próximos passos (em ordem)
1. **Fase 1 — validar com Supabase real**: testar login, busca, criar edição, marcar volumes, lista de compras. Corrigir o que aparecer.
2. **Fase 2 — lembretes por web push**: service worker + manifest (PWA), salvar inscrição em `push_subscriptions`, enviar pelo Worker de lembretes (chaves VAPID; usar lib compatível com Workers, ex. `@block65/webcrypto-web-push`). Web push é o canal principal. O envio por Brevo em `workers/reminders/index.ts` não funciona sem domínio: substituir por web push e deixar e-mail desativado. Mostrar também os lembretes vencidos na tela inicial.
3. **Fase 3 — foto da estante**: `ScanPage` já envia a foto e lista as lombadas. Falta casar cada título com a coleção do usuário/catálogo (busca por título normalizado, depois AniList) e uma tela de revisão com checkbox por item antes de chamar `setVolumesOwned`.
4. **Fase 4 — extras**: ISBN por câmera, empréstimos (`owned_volumes.loaned_to`), estatísticas, exportar CSV.
