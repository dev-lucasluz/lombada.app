-- Lombada 1.4 — mostrar quantas leituras por IA a pessoa ainda tem hoje
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- A tabela scan_usage continua fechada (ninguém lê direto). Esta função devolve só o número de
-- leituras que a PRÓPRIA pessoa já usou hoje; o limite diário fica no servidor (SCAN_DAILY_LIMIT).

create or replace function public.scan_usage_today()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select count from public.scan_usage where user_id = auth.uid() and day = current_date),
    0
  );
$$;

revoke execute on function public.scan_usage_today() from public, anon;
grant execute on function public.scan_usage_today() to authenticated;
