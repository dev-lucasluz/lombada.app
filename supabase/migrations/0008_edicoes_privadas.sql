-- Lombada — edições passam a ser privadas de quem as cadastrou
-- Antes: toda edição cadastrada aparecia para todos os usuários (um amigo criou
-- "Haikyuu!! 999 volumes" e isso apareceu para todo mundo), e o ID de quem cadastrou ficava visível.
-- Agora cada pessoa vê só as edições que cadastrou ou que já estão na própria coleção.
-- Rodar no Supabase: SQL Editor → colar e executar.

drop policy if exists "edições: ler" on public.editions;
create policy "edições: ler as minhas" on public.editions
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.collections c
      where c.edition_id = editions.id and c.user_id = auth.uid()
    )
  );

-- Só quem cadastrou a edição pode corrigi-la (a regra anterior de "exclusiva" não
-- funcionava: a consulta à coleção dos outros é filtrada pelas regras de acesso).
drop policy if exists "edições: corrigir própria ou exclusiva" on public.editions;
drop policy if exists "edições: corrigir própria" on public.editions;
create policy "edições: corrigir própria" on public.editions
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
