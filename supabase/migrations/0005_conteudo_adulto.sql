-- Lombada — marca de conteúdo +18
-- O AniList informa se a obra é adulta; guardamos para filtrar a coleção.
-- Rodar no Supabase: SQL Editor → colar e executar.

alter table public.works add column if not exists is_adult boolean not null default false;
