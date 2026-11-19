-- ENTRA: perfiles, biblioteca, colaboraciones, notificaciones y moderación.
-- Ejecutar después de 20261118_audio_proposals.sql. Conserva cuentas y publicaciones.
begin;
alter table public.profiles add column if not exists instrument_ids bigint[] not null default '{}';
alter table public.profiles add column if not exists genre_ids bigint[] not null default '{}';
alter table public.projects add column if not exists moderation_hidden boolean not null default false;
alter table public.projects add column if not exists moderation_reason text not null default '';
create or replace function public.entra_validate_artist_preferences() returns trigger language plpgsql set search_path=public as $$
begin
 if cardinality(new.instrument_ids)>12 or cardinality(new.genre_ids)>12 then raise exception 'Selecciona hasta 12 opciones por categoría.' using errcode='23514';end if;
 if tg_op='INSERT' or new.instrument_ids is distinct from old.instrument_ids then
  if exists(select 1 from unnest(new.instrument_ids) x where not exists(select 1 from entra_catalog_items c where c.id=x and c.kind='instrument' and c.active)) then raise exception 'Instrumento inválido.' using errcode='23514';end if;
 end if;
 if tg_op='INSERT' or new.genre_ids is distinct from old.genre_ids then
  if exists(select 1 from unnest(new.genre_ids) x where not exists(select 1 from entra_catalog_items c where c.id=x and c.kind='genre' and c.active)) then raise exception 'Género inválido.' using errcode='23514';end if;
 end if;return new;
end $$;
drop trigger if exists entra_artist_preferences on public.profiles;
create trigger entra_artist_preferences before insert or update on public.profiles for each row execute function public.entra_validate_artist_preferences();
-- Una solicitud puede comenzar solo con mensaje; la muestra musical es opcional.
alter table public.entra_proposals alter column audio_bytes drop not null;
alter table public.entra_proposals alter column audio_mime drop not null;
alter table public.entra_proposals alter column audio_duration drop not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.entra_proposals'::regclass and conname='entra_proposal_audio_complete') then
  alter table public.entra_proposals add constraint entra_proposal_audio_complete check((audio_bytes is null and audio_mime is null and audio_duration is null) or (audio_bytes is not null and audio_mime is not null and audio_duration is not null));
 end if;end $$;
create table if not exists public.entra_saved_projects(
 user_id uuid not null references public.profiles(id) on delete cascade,
 project_id bigint not null references public.projects(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,project_id)
);
create table if not exists public.entra_collaborations(
 id bigint generated always as identity primary key,
 proposal_id bigint not null unique references public.entra_proposals(id) on delete cascade,
 project_id bigint not null references public.projects(id) on delete cascade,
 artist_id uuid not null references public.profiles(id),collaborator_id uuid not null references public.profiles(id),
 status text not null default 'active' check(status in ('active','completed','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(artist_id<>collaborator_id)
);
create table if not exists public.entra_notifications(
 id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('proposal','decision','collaboration','moderation')),
 message text not null,project_id bigint references public.projects(id) on delete set null,
 created_at timestamptz not null default now(),read_at timestamptz
);
create index if not exists entra_notifications_user on public.entra_notifications(user_id,created_at desc);
create table if not exists public.entra_reports(
 id bigint generated always as identity primary key,reporter_id uuid not null references public.profiles(id),
 project_id bigint not null references public.projects(id) on delete cascade,
 reason text not null check(char_length(btrim(reason)) between 10 and 500),
 status text not null default 'open' check(status in ('open','resolved','dismissed')),
 created_at timestamptz not null default now(),resolved_by uuid references public.profiles(id),resolved_at timestamptz,
 unique(reporter_id,project_id)
);
do $$ declare tab text;begin
 foreach tab in array array['entra_saved_projects','entra_collaborations','entra_notifications','entra_reports'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from anon,authenticated',tab);
  execute format('grant select,insert,update,delete on public.%I to service_role',tab);
 end loop;end $$;
grant usage,select on sequence public.entra_collaborations_id_seq,public.entra_notifications_id_seq,public.entra_reports_id_seq to service_role;
create or replace function public.entra_proposal_events() returns trigger language plpgsql security definer set search_path=public as $$
declare title text;begin
 select p.title into title from projects p where p.id=new.project_id;
 if tg_op='INSERT' then
  insert into entra_notifications(user_id,kind,message,project_id) values(new.recipient_id,'proposal','Recibiste una propuesta para «'||title||'».',new.project_id);
 elsif new.status is distinct from old.status then
  if old.status<>'pending' then raise exception 'Esta propuesta ya fue revisada.' using errcode='23514';end if;
  insert into entra_notifications(user_id,kind,message,project_id) values(new.applicant_id,'decision','Tu propuesta para «'||title||'» fue '||case when new.status='accepted' then 'aceptada.' else 'rechazada.' end,new.project_id);
  if new.status='accepted' then
   insert into entra_collaborations(proposal_id,project_id,artist_id,collaborator_id) values(new.id,new.project_id,new.recipient_id,new.applicant_id) on conflict(proposal_id) do nothing;
  end if;
 end if;return new;
end $$;
drop trigger if exists entra_proposal_events on public.entra_proposals;
create trigger entra_proposal_events after insert or update of status on public.entra_proposals for each row execute function public.entra_proposal_events();
insert into public.entra_collaborations(proposal_id,project_id,artist_id,collaborator_id)
 select id,project_id,recipient_id,applicant_id from public.entra_proposals where status='accepted' on conflict(proposal_id) do nothing;
create or replace function public.entra_collaboration_events() returns trigger language plpgsql security definer set search_path=public as $$
declare title text;begin
 if new.status is distinct from old.status then
  if old.status<>'active' then raise exception 'La colaboración ya está cerrada.' using errcode='23514';end if;
  new.updated_at=now();select p.title into title from projects p where p.id=new.project_id;
  insert into entra_notifications(user_id,kind,message,project_id) select id,'collaboration','La colaboración de «'||title||'» está '||case when new.status='completed' then 'completada.' else 'cancelada.' end,new.project_id from profiles where id in(new.artist_id,new.collaborator_id);
 end if;return new;
end $$;
drop trigger if exists entra_collaboration_events on public.entra_collaborations;
create trigger entra_collaboration_events before update on public.entra_collaborations for each row execute function public.entra_collaboration_events();
create or replace function public.entra_validate_project_catalog()
returns trigger language plpgsql set search_path=public as $$
declare g text; i text; c text;
begin
 if tg_op='UPDATE' and (to_jsonb(new)-'moderation_hidden'-'moderation_reason'-'updated_at') is not distinct from (to_jsonb(old)-'moderation_hidden'-'moderation_reason'-'updated_at') then return new;end if;
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

create or replace function public.entra_moderate_project(p_actor uuid,p_project bigint,p_hidden boolean,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare owner uuid;title text;begin
 if not exists(select 1 from profiles where id=p_actor and role='superadmin') then raise exception 'Acceso exclusivo del administrador.' using errcode='42501';end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Indica un motivo de 10 a 500 caracteres.' using errcode='22023';end if;
 update projects set moderation_hidden=p_hidden,moderation_reason=btrim(p_reason) where id=p_project returning owner_id,projects.title into owner,title;
 if not found then raise exception 'Proyecto no encontrado.' using errcode='P0002';end if;
 update entra_reports set status='resolved',resolved_by=p_actor,resolved_at=now() where project_id=p_project and status='open';
 insert into entra_notifications(user_id,kind,message,project_id) values(owner,'moderation','Tu publicación «'||title||'» fue '||case when p_hidden then 'ocultada: ' else 'restaurada: ' end||btrim(p_reason),p_project);
end $$;
create or replace function public.entra_feed_page(p_before_time timestamptz default null,p_before_id bigint default null,p_limit integer default 9)
returns table(id bigint,title text,genre text,bpm integer,musical_key text,need text,owner_id uuid,username text,artist_name text,hook_start double precision,hook_end double precision,published_at timestamptz)
language sql stable security invoker set search_path=public as $$
 select p.id,p.title,p.genre,p.bpm,p.musical_key,p.need,p.owner_id,u.username,coalesce(nullif(btrim(u.display_name),''),u.username),p.hook_start,p.hook_end,p.published_at
 from projects p join profiles u on u.id=p.owner_id where p.publication_status='published' and not p.moderation_hidden
 and (p_before_time is null or (p.published_at,p.id)<(p_before_time,p_before_id)) order by p.published_at desc,p.id desc limit least(greatest(p_limit,1),25);
$$;
create or replace function public.entra_discover_page(p_before_time timestamptz default null,p_before_id bigint default null,p_limit integer default 9,p_genre bigint default null,p_instrument bigint default null,p_min integer default 40,p_max integer default 240,p_state text default null,p_query text default '')
returns table(id bigint,title text,genre text,bpm integer,musical_key text,need text,owner_id uuid,username text,artist_name text,hook_start double precision,hook_end double precision,published_at timestamptz)
language sql stable security invoker set search_path=public as $$
 select p.id,p.title,p.genre,p.bpm,p.musical_key,p.need,p.owner_id,u.username,coalesce(nullif(btrim(u.display_name),''),u.username),p.hook_start,p.hook_end,p.published_at
 from projects p join profiles u on u.id=p.owner_id where p.publication_status='published' and not p.moderation_hidden
 and (p_genre is null or p.genre_id=p_genre) and (p_instrument is null or p.instrument_id=p_instrument) and p.bpm between p_min and p_max
 and (p_state is null or p.status=p_state) and (p_query='' or strpos(lower(p.title||' '||coalesce(u.display_name,u.username)),lower(p_query))>0)
 and (p_before_time is null or (p.published_at,p.id)<(p_before_time,p_before_id)) order by p.published_at desc,p.id desc limit least(greatest(p_limit,1),25);
$$;
-- Mantiene el contrato de envío, e impide nuevas propuestas a publicaciones moderadas.
create or replace function public.entra_submit_proposal(p_actor uuid,p_project bigint,p_message text,p_audio bytea,p_mime text,p_duration double precision)
returns bigint language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype;result bigint;begin
 if not exists(select 1 from profiles where id=p_actor) then raise exception 'Cuenta no válida.' using errcode='42501';end if;
 select * into p from projects where id=p_project and publication_status='published' and not moderation_hidden for share;
 if not found then raise exception 'La publicación ya no está disponible.' using errcode='P0002';end if;
 if p.owner_id=p_actor then raise exception 'No puedes enviar una propuesta a tu propio proyecto.' using errcode='22023';end if;
 insert into entra_proposals(project_id,applicant_id,recipient_id,message,audio_bytes,audio_mime,audio_duration,hook_start,hook_end)
 values(p.id,p_actor,p.owner_id,btrim(p_message),p_audio,p_mime,p_duration,p.hook_start,p.hook_end) returning id into result;return result;
end $$;
revoke all on function public.entra_moderate_project(uuid,bigint,boolean,text),public.entra_discover_page(timestamptz,bigint,integer,bigint,bigint,integer,integer,text,text),public.entra_proposal_events(),public.entra_collaboration_events(),public.entra_validate_artist_preferences() from public,anon,authenticated;
grant execute on function public.entra_moderate_project(uuid,bigint,boolean,text),public.entra_discover_page(timestamptz,bigint,integer,bigint,bigint,integer,integer,text,text) to service_role;
commit;
