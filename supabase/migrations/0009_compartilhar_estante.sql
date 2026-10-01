-- Lombada 1.1 — link para compartilhar a estante (somente leitura)
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- Funciona assim: a pessoa liga o compartilhamento no Perfil e ganha um link com um código
-- aleatório (impossível de adivinhar). Quem tem o link vê a estante sem precisar de conta.
-- Desligar apaga o código e o link para de funcionar. Séries +18 e anotações nunca aparecem.

create table if not exists public.shelf_shares (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.shelf_shares enable row level security;

drop policy if exists "compartilhar: ver o meu" on public.shelf_shares;
create policy "compartilhar: ver o meu" on public.shelf_shares
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "compartilhar: ligar" on public.shelf_shares;
create policy "compartilhar: ligar" on public.shelf_shares
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "compartilhar: trocar o código" on public.shelf_shares;
create policy "compartilhar: trocar o código" on public.shelf_shares
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "compartilhar: desligar" on public.shelf_shares;
create policy "compartilhar: desligar" on public.shelf_shares
  for delete to authenticated using (user_id = auth.uid());

-- Leitura pública da estante pelo código. Devolve só o necessário para exibir:
-- nome (o escolhido pela pessoa, nunca o e-mail), obras, edição, total e volumes que ela tem.
create or replace function public.get_shared_shelf(share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'owner', coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), 'Um colecionador'),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', w.title,
          'cover_url', w.cover_url,
          'authors', w.authors,
          'kind', w.kind,
          'edition_name', e.name,
          'publisher', e.publisher,
          'total_volumes', e.total_volumes,
          'owned', (
            select coalesce(jsonb_agg(ov.volume_number order by ov.volume_number), '[]'::jsonb)
            from public.owned_volumes ov
            where ov.collection_id = c.id
              and (e.total_volumes is null or ov.volume_number <= e.total_volumes)
          )
        )
        order by c.updated_at desc
      )
      from public.collections c
      join public.editions e on e.id = c.edition_id
      join public.works w on w.id = e.work_id
      where c.user_id = s.user_id and coalesce(w.is_adult, false) = false
    ), '[]'::jsonb)
  )
  from public.shelf_shares s
  join auth.users u on u.id = s.user_id
  where s.token = share_token;
$$;

revoke execute on function public.get_shared_shelf(uuid) from public;
grant execute on function public.get_shared_shelf(uuid) to anon, authenticated;
