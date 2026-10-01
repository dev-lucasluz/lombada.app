-- Lombada — endurece a edição de "edições" compartilhadas
-- Antes: qualquer pessoa logada podia alterar QUALQUER edição (nome, total, até a obra),
-- inclusive as que outras pessoas usam. Rodar no Supabase: SQL Editor → colar → Run.

drop policy if exists "edições: corrigir" on public.editions;

-- Pode corrigir a edição quem a cadastrou, ou quem é o único a tê-la na coleção.
create policy "edições: corrigir própria ou exclusiva" on public.editions
  for update to authenticated
  using (
    created_by = auth.uid()
    or not exists (
      select 1 from public.collections c
      where c.edition_id = editions.id and c.user_id <> auth.uid()
    )
  )
  with check (true);

-- Campos que ninguém pode mudar depois de criados, e limites de tamanho.
create or replace function public.protect_edition_fields()
returns trigger
language plpgsql
as $$
begin
  if new.work_id <> old.work_id or new.created_by is distinct from old.created_by then
    raise exception 'Não é possível trocar a obra nem o autor de uma edição.';
  end if;
  return new;
end;
$$;

drop trigger if exists editions_protect on public.editions;
create trigger editions_protect before update on public.editions
  for each row execute function public.protect_edition_fields();

alter table public.editions drop constraint if exists editions_limits;
alter table public.editions add constraint editions_limits check (
  char_length(name) between 1 and 120
  and (publisher is null or char_length(publisher) <= 80)
  and (total_volumes is null or total_volumes between 1 and 999)
) not valid;
