-- Ejecutar en SQL Editor de Supabase. No modifica roles ni proyectos existentes.
create table if not exists public.entra_project_assignments (
 id bigint generated always as identity primary key,
 project_id bigint references public.projects(id) on delete set null,
 previous_owner_id uuid, new_owner_id uuid, changed_by uuid,
 changed_at timestamptz not null default now(),
 reason text not null check(char_length(btrim(reason)) between 5 and 300)
);
alter table public.entra_project_assignments enable row level security;
revoke all on public.entra_project_assignments from anon,authenticated;
grant select,insert on public.entra_project_assignments to service_role;
grant usage,select on sequence public.entra_project_assignments_id_seq to service_role;
create or replace function public.entra_assign_project(p_actor uuid,p_project bigint,p_artist uuid,p_expected_owner uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='superadmin') then
  raise exception 'Solo el administrador puede reasignar.' using errcode='42501';
 end if;
 if not exists(select 1 from public.profiles where id=p_artist and role <> 'superadmin') then
  raise exception 'Selecciona un artista registrado válido.' using errcode='22023';
 end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 300 then
  raise exception 'El motivo debe tener entre 5 y 300 caracteres.' using errcode='22023';
 end if;
 select owner_id into v_owner from public.projects where id=p_project for update;
 if not found then raise exception 'Proyecto no encontrado.' using errcode='P0002'; end if;
 if v_owner is distinct from p_expected_owner then
  raise exception 'El proyecto cambió. Recarga Administración.' using errcode='40001';
 end if;
 if v_owner=p_artist then raise exception 'Selecciona otro artista.' using errcode='22023'; end if;
 update public.projects set owner_id=p_artist,updated_at=now() where id=p_project;
 insert into public.entra_project_assignments(project_id,previous_owner_id,new_owner_id,changed_by,reason)
 values(p_project,v_owner,p_artist,p_actor,btrim(p_reason));
end;
$$;
revoke all on function public.entra_assign_project(uuid,bigint,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.entra_assign_project(uuid,bigint,uuid,uuid,text) to service_role;
