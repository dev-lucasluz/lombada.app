-- Lombada 1.5 — só dá para pôr na própria coleção uma edição que é sua
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- Desde a 0008 cada pessoa vê só as edições que cadastrou ou que já estão na própria coleção. Mas a regra de
-- "coleções: dono" só conferia o user_id: quem soubesse o ID (um UUID, impossível de adivinhar) de uma edição
-- privada de outra pessoa podia pô-la na própria coleção e, com isso, passar a ler a edição e a obra dela.
-- Agora só entra na coleção uma edição que a pessoa cadastrou ou que já está na coleção dela (linhas antigas).
--
-- A conferência vai numa função security definer porque a regra de leitura das edições já consulta as
-- coleções: pôr a consulta direto na política causaria "infinite recursion detected in policy".

create or replace function public.can_collect_edition(p_edition uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.editions e where e.id = p_edition and e.created_by = auth.uid())
      or exists (select 1 from public.collections c where c.edition_id = p_edition and c.user_id = auth.uid());
$$;

revoke execute on function public.can_collect_edition(uuid) from public, anon;
grant execute on function public.can_collect_edition(uuid) to authenticated;

drop policy if exists "coleções: dono" on public.collections;
create policy "coleções: dono" on public.collections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_collect_edition(edition_id));
