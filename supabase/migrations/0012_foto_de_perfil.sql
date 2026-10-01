-- Lombada 1.3 — foto de perfil enviada pela própria pessoa
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- A foto fica em profiles.avatar_url: ou um endereço https (a foto do Google, copiada no cadastro)
-- ou um JPEG pequeno em base64 (a foto enviada pela pessoa, já recortada e reduzida pelo app).
-- O banco recusa qualquer outro formato e limita o tamanho, mesmo que alguém fale direto com a API.
-- Só a própria pessoa lê e altera o seu perfil (regras já existentes).

alter table public.profiles drop constraint if exists profiles_avatar_valid;
alter table public.profiles add constraint profiles_avatar_valid check (
  avatar_url is null
  or (
    char_length(avatar_url) <= 90000
    and (
      avatar_url ~ '^https://[^[:space:]"''<>]{1,600}$'
      or avatar_url ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    )
  )
);
