-- Lombada 1.2 — avisar quem enviou feedback quando ele é lido ou resolvido
-- Rodar no Supabase: SQL Editor → colar e executar.

-- Última situação que a própria pessoa já viu. Se a situação mudou depois (o admin marcou
-- como lido ou resolvido), o app mostra um aviso e atualiza este campo.
alter table public.feedback add column if not exists notified_status text not null default 'novo';

-- Feedbacks antigos não geram aviso retroativo.
update public.feedback set notified_status = status;

-- Cada pessoa pode ler só as próprias mensagens (o admin continua lendo todas).
drop policy if exists "feedback: ver as minhas" on public.feedback;
create policy "feedback: ver as minhas" on public.feedback
  for select to authenticated using (user_id = auth.uid());

-- A pessoa não edita a tabela; só marca como visto pelo comando abaixo.
create or replace function public.ack_feedback(feedback_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.feedback set notified_status = status
  where id = feedback_id and user_id = auth.uid();
$$;

revoke execute on function public.ack_feedback(uuid) from public, anon;
grant execute on function public.ack_feedback(uuid) to authenticated;
