-- Lombada — cor da capa nas lombadas e "últimas adições"
-- Rodar no Supabase: SQL Editor → colar e executar.

-- Cor predominante da capa (vem do AniList), usada para pintar as lombadas.
alter table public.works add column if not exists cover_color text
  check (cover_color is null or cover_color ~ '^#[0-9a-fA-F]{6}$');

-- Última atividade na série (volume marcado ou desmarcado), para "últimas adições".
alter table public.collections add column if not exists updated_at timestamptz not null default now();
update public.collections set updated_at = created_at where updated_at > created_at;

create or replace function public.touch_collection_from_volume()
returns trigger
language plpgsql
as $$
begin
  update public.collections
  set updated_at = now()
  where id = coalesce(new.collection_id, old.collection_id);
  return null;
end;
$$;

drop trigger if exists owned_volumes_touch on public.owned_volumes;
create trigger owned_volumes_touch
  after insert or delete on public.owned_volumes
  for each row execute function public.touch_collection_from_volume();

create index if not exists collections_recent_idx on public.collections (user_id, updated_at desc);
