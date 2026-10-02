-- Lombada 1.4 — capa enviada pela pessoa ao cadastrar uma obra à mão
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- 1) A capa fica em works.cover_url: ou um endereço http(s) (catálogos) ou um JPEG pequeno em base64
--    (enviado pela pessoa, já reduzido pelo app). O banco recusa qualquer outro formato nas linhas
--    novas e alteradas, mesmo que alguém fale direto com a API.
-- 2) Obras cadastradas à mão (sem id de catálogo) deixam de ser legíveis por todos: só quem as criou
--    e quem as tem na coleção as enxerga. As obras dos catálogos (AniList, Open Library, Google Books)
--    continuam abertas a todos os logados, como antes.

alter table public.works drop constraint if exists works_cover_valid;
alter table public.works add constraint works_cover_valid check (
  cover_url is null
  or (
    char_length(cover_url) <= 90000
    and (
      cover_url ~ '^https?://[^[:space:]"''<>]{1,1000}$'
      or cover_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    )
  )
) not valid;

drop policy if exists "obras: ler" on public.works;
drop policy if exists "obras: ler catálogo e as minhas" on public.works;
create policy "obras: ler catálogo e as minhas" on public.works
  for select to authenticated
  using (
    anilist_id is not null
    or google_books_id is not null
    or open_library_id is not null
    or created_by = auth.uid()
    or exists (
      select 1
      from public.editions e
      join public.collections c on c.edition_id = e.id
      where e.work_id = works.id and c.user_id = auth.uid()
    )
  );
