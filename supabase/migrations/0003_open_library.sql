-- Lombada — livros do Open Library
-- O Google Books sem chave usa uma cota diária compartilhada com o mundo todo e
-- vive esgotada; a busca de livros passou a usar o Open Library.
-- Rodar no Supabase: SQL Editor → colar e executar.

alter table public.works add column if not exists open_library_id text unique;

-- Livros salvos antes desta migração guardaram o id como "ol:/works/..." em google_books_id.
update public.works
set open_library_id = substring(google_books_id from 4), google_books_id = null
where google_books_id like 'ol:%' and open_library_id is null;
