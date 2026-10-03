-- Lombada 1.5 — devolve a leitura por IA quando o Gemini falha (503, limite do Google, resposta ilegível)
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- A leitura é descontada ANTES de chamar o Gemini (atômico: várias requisições ao mesmo tempo não passam do
-- limite diário). Se o Gemini falhar, o servidor chama esta função para devolver 1 leitura. Como a pessoa
-- também poderia chamá-la direto, o banco limita as devoluções a 5 por dia: o pior caso é ganhar 5 leituras.
-- Sem esta migração o app continua funcionando; só não devolve a leitura quando o Gemini falha.

alter table public.scan_usage add column if not exists refunded int not null default 0;

create or replace function public.refund_scan_quota()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.scan_usage
  set count = count - 1, refunded = refunded + 1
  where user_id = auth.uid() and day = current_date and count > 0 and refunded < 5
  returning true into ok;

  return coalesce(ok, false);
end;
$$;

revoke execute on function public.refund_scan_quota() from public, anon;
grant execute on function public.refund_scan_quota() to authenticated;
