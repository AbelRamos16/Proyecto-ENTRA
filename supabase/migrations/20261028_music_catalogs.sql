-- Ejecutar COMPLETO antes de desplegar esta versión. Conserva proyectos y asignaciones previas.
begin;
create table if not exists public.entra_catalog_items (
 id bigint generated always as identity primary key,
 kind text not null check (kind in ('genre','instrument','collaboration')),
 name text not null check (char_length(btrim(name)) between 2 and 60 and name !~ '[<>[:cntrl:]]'),
 parent_id bigint references public.entra_catalog_items(id) on delete restrict,
 active boolean not null default true,
 check ((kind='collaboration' and parent_id is not null) or (kind<>'collaboration' and parent_id is null))
);
create unique index if not exists entra_catalog_unique_name
 on public.entra_catalog_items(kind, lower(btrim(name)), coalesce(parent_id,0));
alter table public.entra_catalog_items enable row level security;
revoke all on public.entra_catalog_items from anon, authenticated;
grant select,insert,update on public.entra_catalog_items to service_role;
grant usage,select on sequence public.entra_catalog_items_id_seq to service_role;

insert into public.entra_catalog_items(kind,name)
select 'genre', name from (values ('Alternativo'),('Electrónica'),('Hip hop'),('Indie'),('Pop'),('Rock')) v(name)
on conflict do nothing;
insert into public.entra_catalog_items(kind,name)
select 'genre', genre from public.projects where genre is not null and char_length(btrim(genre)) between 2 and 60
on conflict do nothing;
insert into public.entra_catalog_items(kind,name)
select 'instrument', name from (values ('Voz'),('Bajo'),('Guitarra'),('Batería'),('Teclados')) v(name)
on conflict do nothing;
insert into public.entra_catalog_items(kind,name,parent_id)
select 'collaboration', v.name, i.id
from (values ('Voz','Coro'),('Voz','Verso'),('Bajo','Línea de bajo'),('Guitarra','Riff'),('Guitarra','Solo'),('Batería','Ritmo'),('Teclados','Armonía')) v(instrument,name)
join public.entra_catalog_items i on i.kind='instrument' and i.name=v.instrument
on conflict do nothing;

alter table public.projects add column if not exists genre_id bigint references public.entra_catalog_items(id);
alter table public.projects add column if not exists instrument_id bigint references public.entra_catalog_items(id);
alter table public.projects add column if not exists collaboration_id bigint references public.entra_catalog_items(id);
drop trigger if exists entra_project_catalog_validation on public.projects;
update public.projects p set genre_id=i.id
from public.entra_catalog_items i
where p.genre_id is null and i.kind='genre' and lower(i.name)=lower(p.genre);

-- El género ya no es una lista fija: se valida contra el catálogo.
do $$
declare constraint_row record;
begin
 for constraint_row in select conname from pg_constraint
 where conrelid='public.projects'::regclass and contype='c'
 and pg_get_constraintdef(oid) ~ '\mgenre\M'
 loop execute format('alter table public.projects drop constraint %I', constraint_row.conname); end loop;
end $$;

create or replace function public.entra_validate_catalog()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='UPDATE' then
   if new.kind<>old.kind then raise exception 'No se permite cambiar el tipo de catálogo.'; end if;
   if new.parent_id is distinct from old.parent_id and exists(select 1 from public.projects where collaboration_id=old.id) then
     raise exception 'No se puede cambiar el instrumento de una colaboración utilizada.';
   end if;
 end if;
 if new.kind='collaboration' then
   perform 1 from public.entra_catalog_items where id=new.parent_id and kind='instrument' and (active or not new.active) for share;
   if not found then raise exception 'Selecciona un instrumento activo.'; end if;
 end if;
 return new;
end $$;
drop trigger if exists entra_catalog_validation on public.entra_catalog_items;
create trigger entra_catalog_validation before insert or update on public.entra_catalog_items
for each row execute function public.entra_validate_catalog();

create or replace function public.entra_validate_project_catalog()
returns trigger language plpgsql set search_path=public as $$
declare g text; i text; c text;
begin
 select name into g from public.entra_catalog_items where id=new.genre_id and kind='genre' and active for share;
 if g is null then raise exception 'Selecciona un género activo.' using errcode='23514'; end if;
 select name into i from public.entra_catalog_items where id=new.instrument_id and kind='instrument' and active for share;
 if i is null then raise exception 'Selecciona un instrumento activo.' using errcode='23514'; end if;
 select name into c from public.entra_catalog_items
 where id=new.collaboration_id and kind='collaboration' and active and parent_id=new.instrument_id for share;
 if c is null then raise exception 'La colaboración no corresponde al instrumento.' using errcode='23514'; end if;
 new.genre=g;
 new.need=c || ' · ' || i;
 return new;
end $$;
drop trigger if exists entra_project_catalog_validation on public.projects;
create trigger entra_project_catalog_validation before insert or update on public.projects
for each row execute function public.entra_validate_project_catalog();

-- Retira la operación anterior del backend; conserva el historial existente.
revoke execute on function public.entra_validate_catalog() from public,anon,authenticated;
revoke execute on function public.entra_validate_project_catalog() from public,anon,authenticated;
do $$
begin
 if to_regprocedure('public.entra_assign_project(uuid,bigint,uuid,uuid,text)') is not null then
   revoke execute on function public.entra_assign_project(uuid,bigint,uuid,uuid,text) from service_role;
 end if;
end $$;
commit;
