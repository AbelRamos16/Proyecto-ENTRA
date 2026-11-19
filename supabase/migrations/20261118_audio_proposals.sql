begin;
create table if not exists public.entra_proposals(
 id bigint generated always as identity primary key,
 project_id bigint not null references public.projects(id) on delete cascade,
 applicant_id uuid not null references public.profiles(id),
 recipient_id uuid not null references public.profiles(id),
 message text not null check(char_length(btrim(message)) between 5 and 1000),
 audio_bytes bytea not null check(octet_length(audio_bytes) between 1 and 10485760),
 audio_mime text not null check(audio_mime in ('audio/wav','audio/mpeg')),
 audio_duration double precision not null check(audio_duration between 0.5 and 60.1),
 hook_start double precision not null,hook_end double precision not null,
 status text not null default 'pending' check(status in('pending','accepted','rejected')),
 created_at timestamptz not null default now(),decided_at timestamptz,
 check(applicant_id<>recipient_id),unique(project_id,applicant_id)
);
alter table public.entra_proposals drop constraint if exists entra_proposals_audio_bytes_check;
alter table public.entra_proposals add constraint entra_proposals_audio_bytes_check check(octet_length(audio_bytes) between 1 and 10485760);
create index if not exists entra_proposals_recipient on public.entra_proposals(recipient_id,created_at desc);
alter table public.entra_proposals enable row level security;
revoke all on public.entra_proposals from anon,authenticated;
grant select,insert,update on public.entra_proposals to service_role;
grant usage,select on sequence public.entra_proposals_id_seq to service_role;
create or replace function public.entra_submit_proposal(p_actor uuid,p_project bigint,p_message text,p_audio bytea,p_mime text,p_duration double precision)
returns bigint language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype;result bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor) then raise exception 'Cuenta no válida.' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project and publication_status='published' for share;
 if not found then raise exception 'La publicación ya no está disponible.' using errcode='P0002'; end if;
 if p.owner_id=p_actor then raise exception 'No puedes enviar una propuesta a tu propio proyecto.' using errcode='22023';end if;
 insert into public.entra_proposals(project_id,applicant_id,recipient_id,message,audio_bytes,audio_mime,audio_duration,hook_start,hook_end)
 values(p.id,p_actor,p.owner_id,btrim(p_message),p_audio,p_mime,p_duration,p.hook_start,p.hook_end) returning id into result;
 return result;
end $$;
revoke all on function public.entra_submit_proposal(uuid,bigint,text,bytea,text,double precision) from public,anon,authenticated;
grant execute on function public.entra_submit_proposal(uuid,bigint,text,bytea,text,double precision) to service_role;
commit;
