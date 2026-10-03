-- Lombada 1.5 — livros de uma mesma série com títulos diferentes (ex.: A Seleção, A Elite, A Escolhida)
-- Rodar no Supabase: SQL Editor → colar e executar.
--
-- Cada livro continua sendo uma obra e uma edição com o título real. Três colunas novas na edição
-- dizem a que série ele pertence: nome da série, número do livro nela e (opcional) quantos livros a série
-- tem. A Coleção junta os livros do mesmo nome de série numa faixa de lombadas, com os vãos do que falta.
-- As regras de leitura e escrita das edições (migração 0008) valem para as colunas novas.

alter table public.editions add column if not exists series_name text;
alter table public.editions add column if not exists series_number integer;
alter table public.editions add column if not exists series_total integer;

alter table public.editions drop constraint if exists editions_series_valid;
alter table public.editions add constraint editions_series_valid check (
  (series_name is null or char_length(btrim(series_name)) between 1 and 120)
  and (series_number is null or series_number between 1 and 999)
  and (series_total is null or series_total between 1 and 999)
);
