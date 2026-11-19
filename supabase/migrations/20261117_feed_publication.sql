-- Ejecutar completo antes de desplegar. Requiere las migraciones de catálogos y perfiles.
begin;
alter table public.projects add column if not exists publication_status text not null default 'draft';
alter table public.projects add column if not exists published_at timestamptz;
do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='entra_publication_status_valid') then
  alter table public.projects add constraint entra_publication_status_valid check(publication_status in ('draft','published'));
 end if;
end $$;
create index if not exists entra_feed_published_order on public.projects(published_at desc,id desc) where publication_status='published';
create or replace function public.entra_validate_project_catalog()
returns trigger language plpgsql set search_path=public as $$
declare g text; i text; c text;
begin
 if tg_op='UPDATE' and new.publication_status='draft'
 and new.genre_id is not distinct from old.genre_id and new.instrument_id is not distinct from old.instrument_id
 and new.collaboration_id is not distinct from old.collaboration_id and new.genre is not distinct from old.genre and new.need is not distinct from old.need then return new; end if;
 select name into g from public.entra_catalog_items where id=new.genre_id and kind='genre' and active for share;
 if g is null then raise exception 'Selecciona un género activo.' using errcode='23514'; end if;
 select name into i from public.entra_catalog_items where id=new.instrument_id and kind='instrument' and active for share;
 if i is null then raise exception 'Selecciona un instrumento activo.' using errcode='23514'; end if;
 select name into c from public.entra_catalog_items where id=new.collaboration_id and kind='collaboration' and active and parent_id=new.instrument_id for share;
 if c is null then raise exception 'La colaboración no corresponde al instrumento.' using errcode='23514'; end if;
 new.genre=g;new.need=c || ' · ' || i;return new;
end $$;
create or replace function public.entra_validate_publication()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.publication_status='published' then
  if new.title is null or char_length(btrim(new.title))<3 or new.genre_id is null or new.instrument_id is null or new.collaboration_id is null
   or new.audio_bytes is null or octet_length(new.audio_bytes)=0 or coalesce(new.audio_name,'')=''
   or new.audio_duration is null or not(new.audio_duration>0 and new.audio_duration<'Infinity'::float8)
   or new.hook_start is null or new.hook_end is null or not(new.hook_start>=0 and new.hook_start<new.hook_end and new.hook_end<=new.audio_duration) then
    raise exception 'Para publicar, completa la ficha, adjunta una demo y marca un hook válido.' using errcode='23514';
  end if;
  if new.status='Borrador' then new.status='Buscando colaboración'; end if;
  if tg_op='INSERT' then new.published_at=now();
  elsif old.publication_status<>'published' then new.published_at=now();
  else new.published_at=old.published_at; end if;
 else new.published_at=null;
 end if;
 return new;
end $$;
drop trigger if exists entra_publication_validation on public.projects;
create trigger entra_publication_validation before insert or update on public.projects for each row execute function public.entra_validate_publication();
create or replace function public.entra_feed_page(p_before_time timestamptz default null,p_before_id bigint default null,p_limit integer default 9)
returns table(id bigint,title text,genre text,bpm integer,musical_key text,need text,owner_id uuid,username text,artist_name text,hook_start double precision,hook_end double precision,published_at timestamptz)
language sql stable security invoker set search_path=public as $$
 select p.id,p.title,p.genre,p.bpm,p.musical_key,p.need,p.owner_id,u.username,coalesce(nullif(btrim(u.display_name),''),u.username),
 p.hook_start,p.hook_end,p.published_at
 from public.projects p join public.profiles u on u.id=p.owner_id
 where p.publication_status='published'
 and (p_before_time is null or (p.published_at,p.id)<(p_before_time,p_before_id))
 order by p.published_at desc,p.id desc limit least(greatest(p_limit,1),25);
$$;
revoke all on function public.entra_feed_page(timestamptz,bigint,integer) from public,anon,authenticated;
grant execute on function public.entra_feed_page(timestamptz,bigint,integer) to service_role;
revoke all on function public.entra_validate_publication() from public,anon,authenticated;
commit;
