# Lombada — plano do projeto

App web gratuito para registrar coleções físicas de mangás e livros e o histórico de leitura de mangás online. Multiusuário (você e amigos), funciona igual no celular, tablet e PC.

## O que o app faz

1. **Login com e-mail e senha** (Supabase Auth, e-mails enviados pelo SMTP do Gmail): criar conta com confirmação por e-mail, esqueci a senha, redefinir senha.
2. **Coleção física**
   - Busca a obra no AniList (mangá) ou Open Library (livro; Google Books só como reserva, porque sem chave a cota é compartilhada e vive esgotada).
   - Cada obra tem **edições** (ex.: Naruto → "Naruto Gold, Panini, 72 vol."). Edições são compartilhadas entre usuários e editáveis, porque o total de volumes no Brasil não bate com o japonês.
   - Grade de volumes: clique marca/desmarca, Shift+clique marca um intervalo. Mostra "Tem: 1–30 · Faltam: 31–50".
   - Lista de compras gerada a partir do que falta.
3. **Leitura online**
   - Histórico: obra, último capítulo lido, link, status (lendo, em hiato, pausado, concluído, abandonado), data.
   - **Lembretes por data** definidos pelo usuário ("me avise em 15/10: volta do hiato").
   - Sem verificação automática de capítulo novo (decisão: MangaDex não é confiável).
4. **Foto da estante** (fase 3)
   - Foto → Gemini Flash-Lite lê as lombadas → tela de revisão → salva.
   - Foto não é armazenada. Limite por usuário/dia para não esgotar a cota grátis.
5. **Cadastro por voz** (fase 3, junto com a foto)
   - A pessoa fala: "tenho Naruto do 1 ao 10, falta o 11, tenho do 12 ao 20".
   - Reconhecimento de fala do próprio navegador (Web Speech API): grátis, sem chave. Funciona no Chrome, Edge e Safari; no Firefox, o botão some.
   - O texto vira dados (título + volumes) com o Gemini grátis; o app busca a obra no catálogo.
   - Usa **a mesma tela de revisão** da foto da estante antes de salvar.
6. **Extras** (fase 4): código de barras (ISBN), empréstimos, estatísticas, exportar CSV.

## Stack (custo zero)

| Parte | Tecnologia |
|---|---|
| Front | React + Vite + TypeScript (SPA), React Router, TanStack Query |
| Hospedagem | Cloudflare Workers com arquivos estáticos (deploy pelo GitHub) |
| Backend leve | Worker (`worker/`) — rotas `/api` que chamam o Gemini |
| Tarefa diária | Cloudflare Worker com cron (`workers/reminders/`) — envia lembretes |
| Banco + login | Supabase (Postgres + RLS + Auth por e-mail e senha) |
| IA de visão | Gemini API, plano grátis do AI Studio |
| E-mails de conta | SMTP do Gmail com senha de app (grátis, sem domínio) |
| Lembretes | Web Push (grátis). E-mail só se houver domínio próprio no futuro |

## Estrutura

```
src/
  lib/          supabase, catálogo (AniList/Open Library), utilitários de faixas de volume
  components/   AppShell (navegação), VolumeGrid, SpineStrip, etc.
  pages/        Login, Colecao, Edicao, Adicionar, Leitura, Lembretes, Estante (foto)
  styles/       tokens e estilos globais
worker/api/     scan-shelf.ts e parse-voice.ts (Gemini)
workers/reminders/  cron diário de lembretes
supabase/migrations/  schema + RLS
```

## Fases

- [x] **Base**: projeto, schema completo, design system, navegação, login.
- [x] **Fase 1**: coleção física completa (busca, edições, grade, lista de compras). Testada com Supabase real.
- [~] **Fase 2**: "Onde parei" e lembretes por data prontos; falta o aviso por notificação (web push) e publicar o Worker diário.
- [x] **Fase 3**: foto da estante e cadastro por voz, com tela de revisão compartilhada. Falta testar com a chave do Gemini.
- [ ] **Fase 4**: extras.

Detalhes de configuração e o que falta em cada fase: ver `README.md`.
