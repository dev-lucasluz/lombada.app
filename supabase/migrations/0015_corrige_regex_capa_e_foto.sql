-- Lombada 1.4.1 — corrige "invalid regular expression: invalid repetition count(s)"
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- O Postgres aceita no máximo 255 repetições em {n,m}. As migrações 0012 e 0013 usavam {1,600} e
-- {1,1000}, então salvar obra com capa de catálogo (http/https) ou perfil com foto do Google falhava.
-- O limite de tamanho continua garantido por char_length (acima de cada regex).

alter table public.works drop constraint if exists works_cover_valid;
alter table public.works add constraint works_cover_valid check (
  cover_url is null
  or (
    char_length(cover_url) <= 90000
    and (
      (char_length(cover_url) <= 1100 and cover_url ~ '^https?://[^[:space:]"''<>]+$')
      or cover_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    )
  )
) not valid;

alter table public.profiles drop constraint if exists profiles_avatar_valid;
alter table public.profiles add constraint profiles_avatar_valid check (
  avatar_url is null
  or (
    char_length(avatar_url) <= 90000
    and (
      (char_length(avatar_url) <= 700 and avatar_url ~ '^https://[^[:space:]"''<>]+$')
      or avatar_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    )
  )
);
