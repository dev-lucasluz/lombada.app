-- Lombada 1.3 — foto opcional no feedback
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- A foto é guardada no próprio banco, já reduzida e convertida para JPEG pelo app (o que também
-- apaga dados escondidos da imagem, como a localização). O banco aceita SOMENTE um JPEG em
-- base64 de até ~330 KB: qualquer outra coisa é recusada, mesmo que alguém fale direto com a API.
-- Quem lê é o administrador (e a própria pessoa); os limites de envio por dia continuam valendo.

alter table public.feedback add column if not exists image_data text;

alter table public.feedback drop constraint if exists feedback_image_valid;
alter table public.feedback add constraint feedback_image_valid check (
  image_data is null
  or (
    char_length(image_data) <= 450000
    and image_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

-- Marca se há foto, para a lista do admin não baixar todas as imagens de uma vez.
alter table public.feedback add column if not exists has_image boolean
  generated always as (image_data is not null) stored;
