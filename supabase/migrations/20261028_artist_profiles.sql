-- Ejecutar antes de desplegar la administración de Artistas y Proyectos.
-- No modifica credenciales, roles ni autoría de proyectos.
begin;
alter table public.profiles add column if not exists bio text default '';
do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='entra_profile_display_name_valid') then
   alter table public.profiles add constraint entra_profile_display_name_valid
   check(display_name is null or (char_length(btrim(display_name)) between 2 and 60 and display_name !~ '[<>[:cntrl:]]')) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='entra_profile_bio_valid') then
   alter table public.profiles add constraint entra_profile_bio_valid
   check(bio is null or char_length(bio)<=500) not valid;
 end if;
end $$;
-- NOT VALID conserva perfiles históricos; comprueba nuevas inserciones y modificaciones.
-- Se conserva la configuración RLS y permisos existente de profiles.
commit;
