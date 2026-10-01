-- Lombada — feedback dos usuários e área de administração
-- Rodar no Supabase: SQL Editor → colar e executar.
-- Depois de rodar, torne a SUA conta administradora com o comando do final deste arquivo.

-- Quem é administrador (só o dono do projeto; sem senha nova, usa a conta que já existe).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

drop policy if exists "admin: ver a si mesmo" on public.admins;
create policy "admin: ver a si mesmo" on public.admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Mensagens de feedback
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  user_email text,
  kind text not null default 'ideia' check (kind in ('erro', 'ideia', 'elogio')),
  message text not null check (char_length(message) between 3 and 2000),
  page text check (char_length(page) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  status text not null default 'novo' check (status in ('novo', 'lido', 'resolvido')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

-- Preenche o e-mail pelo servidor (não dá para forjar) e limita 10 mensagens por dia por pessoa.
create or replace function public.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.feedback
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Você já enviou 10 mensagens hoje. Tente de novo amanhã.';
  end if;
  new.user_email := (select email from auth.users where id = new.user_id);
  new.status := 'novo';
  return new;
end;
$$;

drop trigger if exists feedback_before_insert on public.feedback;
create trigger feedback_before_insert
  before insert on public.feedback
  for each row execute function public.feedback_before_insert();

drop policy if exists "feedback: enviar" on public.feedback;
create policy "feedback: enviar" on public.feedback
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "feedback: admin lê" on public.feedback;
create policy "feedback: admin lê" on public.feedback
  for select to authenticated using (public.is_admin());

drop policy if exists "feedback: admin atualiza" on public.feedback;
create policy "feedback: admin atualiza" on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "feedback: admin apaga" on public.feedback;
create policy "feedback: admin apaga" on public.feedback
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- ÚLTIMO PASSO (rode separado, trocando pelo e-mail da sua conta no Lombada):
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'SEU_EMAIL_AQUI'
--   on conflict do nothing;
-- ---------------------------------------------------------------------------
