-- Lombada — endurece o feedback (auditoria da área de administração)
-- Rodar no Supabase: SQL Editor → colar e executar.

-- Brecha: quem enviava podia informar o próprio created_at (ex.: uma data antiga) e assim
-- escapar do limite de 10 mensagens por dia. Agora a data é sempre a do servidor.
create or replace function public.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  if (select count(*) from public.feedback
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Você já enviou 10 mensagens hoje. Tente de novo amanhã.';
  end if;
  new.user_email := (select email from auth.users where id = new.user_id);
  new.status := 'novo';
  return new;
end;
$$;

-- is_admin só precisa existir para quem está logado.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
