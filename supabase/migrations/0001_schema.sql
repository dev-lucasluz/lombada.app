-- Lombada — schema inicial
-- Rodar no Supabase: SQL Editor → colar e executar (ou `supabase db push` com a CLI).

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  email_reminders boolean not null default true,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Catálogo compartilhado: obras e edições
-- ---------------------------------------------------------------------------
create type public.work_kind as enum ('manga', 'book');

create table public.works (
  id uuid primary key default gen_random_uuid(),
  kind public.work_kind not null,
  title text not null,
  original_title text,
  authors text[] not null default '{}',
  cover_url text,
  -- Total da edição original (ex.: japonesa). Nulo quando ainda em lançamento/desconhecido.
  original_volumes int,
  anilist_id int unique,
  google_books_id text unique,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index works_title_idx on public.works using gin (to_tsvector('simple', title));

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  name text not null,                 -- ex.: "Naruto Gold"
  publisher text,                     -- ex.: "Panini"
  total_volumes int check (total_volumes is null or total_volumes > 0),
  is_finished boolean not null default false, -- a edição já terminou de sair?
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editions_work_idx on public.editions (work_id);

-- ---------------------------------------------------------------------------
-- Coleção do usuário
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, edition_id)
);

create table public.owned_volumes (
  collection_id uuid not null references public.collections (id) on delete cascade,
  volume_number int not null check (volume_number > 0),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  acquired_at date,
  loaned_to text,                     -- fase 4: empréstimos
  primary key (collection_id, volume_number)
);

create index owned_volumes_user_idx on public.owned_volumes (user_id);

-- ---------------------------------------------------------------------------
-- Leitura online e lembretes
-- ---------------------------------------------------------------------------
create type public.reading_status as enum ('reading', 'hiatus', 'paused', 'finished', 'dropped');

create table public.reading_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  work_id uuid references public.works (id) on delete set null,
  title text not null,
  cover_url text,
  status public.reading_status not null default 'reading',
  last_chapter numeric(7, 1),          -- aceita capítulos como 44.5
  latest_released_chapter numeric(7, 1),
  source_url text,
  notes text,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reading_entries_user_idx on public.reading_entries (user_id, last_read_at desc);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reading_entry_id uuid references public.reading_entries (id) on delete cascade,
  remind_on date not null,
  message text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index reminders_due_idx on public.reminders (remind_on) where sent_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cota diária da leitura por foto
-- ---------------------------------------------------------------------------
create table public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

-- Consome 1 leitura da cota do usuário atual. Retorna false se a cota do dia acabou.
create function public.consume_scan_quota(daily_limit int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  used int;
begin
  if auth.uid() is null then
    return false;
  end if;

  insert into public.scan_usage (user_id, day, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = scan_usage.count + 1
  returning count into used;

  if used > daily_limit then
    update public.scan_usage set count = count - 1
    where user_id = auth.uid() and day = current_date;
    return false;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger editions_touch before update on public.editions
  for each row execute function public.touch_updated_at();
create trigger reading_entries_touch before update on public.reading_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.works enable row level security;
alter table public.editions enable row level security;
alter table public.collections enable row level security;
alter table public.owned_volumes enable row level security;
alter table public.reading_entries enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.scan_usage enable row level security;

-- Perfil: cada um vê e edita o seu
create policy "perfil próprio: ler" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "perfil próprio: editar" on public.profiles
  for update to authenticated using (id = auth.uid());

-- Catálogo: todos logados leem e cadastram; só quem criou edita a obra.
-- Edições podem ser corrigidas por qualquer usuário logado (catálogo colaborativo).
create policy "obras: ler" on public.works
  for select to authenticated using (true);
create policy "obras: cadastrar" on public.works
  for insert to authenticated with check (created_by = auth.uid());
create policy "obras: editar própria" on public.works
  for update to authenticated using (created_by = auth.uid());

create policy "edições: ler" on public.editions
  for select to authenticated using (true);
create policy "edições: cadastrar" on public.editions
  for insert to authenticated with check (created_by = auth.uid());
create policy "edições: corrigir" on public.editions
  for update to authenticated using (true);

-- Dados pessoais: somente o dono
create policy "coleções: dono" on public.collections
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "volumes: dono" on public.owned_volumes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  );
create policy "leituras: dono" on public.reading_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lembretes: dono" on public.reminders
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      reading_entry_id is null
      or exists (select 1 from public.reading_entries r where r.id = reading_entry_id and r.user_id = auth.uid())
    )
  );
create policy "push: dono" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cota: ler própria" on public.scan_usage
  for select to authenticated using (user_id = auth.uid());
