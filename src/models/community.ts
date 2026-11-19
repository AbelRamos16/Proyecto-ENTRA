import {supabaseAdmin as db} from '../config/supabase.ts';
import {ValidationError} from './project.ts';
import {validateArtistProfile,requireAdmin} from './admin.ts';
import type {AuthUser} from './user.ts';
import type {CatalogItem} from './catalog.ts';
import type {FeedItem} from './feed.ts';
export type PublicProfile={id:string;username:string;display_name:string|null;bio:string|null;instrument_ids:number[];genre_ids:number[]};
export type Collaboration={id:number;proposal_id:number;project_id:number;artist_id:string;collaborator_id:string;status:'active'|'completed'|'cancelled';created_at:string;projects:{title:string}|null;counterpart_name?:string;counterpart_username?:string};
export type Notification={id:number;kind:string;message:string;read_at:string|null;created_at:string};
export type Report={id:number;project_id:number;reason:string;status:string;created_at:string;projects:{title:string;moderation_hidden:boolean;moderation_reason:string}|null};
const check=(error:{message:string}|null)=>{if(error)throw new Error('No se pudo completar la operación de comunidad. '+error.message);};
export function validatePreferences(fields:URLSearchParams,items:CatalogItem[]){
 const profile=validateArtistProfile(fields);
 const select=(key:string,kind:string)=>{const raw=fields.getAll(key),ids=[...new Set(raw.map(Number))];if(ids.length>12||ids.some(id=>!Number.isSafeInteger(id)||!items.some(c=>c.id===id&&c.kind===kind&&c.active)))throw new ValidationError('Elige hasta 12 opciones activas por categoría.');return ids;};
 return {...profile,instrument_ids:select('instruments','instrument'),genre_ids:select('genres','genre')};
}
export class CommunityModel{
 async artists(){const {data,error}=await db.from('profiles').select('id,username,display_name,bio,instrument_ids,genre_ids').order('username').limit(100);check(error);return data as PublicProfile[];}
 async profile(username:string){
  if(!username||username.length>80)return undefined;
  const {data,error}=await db.from('profiles').select('id,username,display_name,bio,instrument_ids,genre_ids').eq('username',username).maybeSingle();check(error);return data as PublicProfile|undefined;
 }
 async saveProfile(user:AuthUser,fields:URLSearchParams,items:CatalogItem[]){const input=validatePreferences(fields,items);const {error}=await db.from('profiles').update(input).eq('id',user.id);if(error?.code==='23514')throw new ValidationError('Revisa las opciones de tu perfil.');check(error);}
 async publications(owner?:string,ids?:number[]){
  if(ids&&!ids.length)return [];
  let query=db.from('projects').select('id,title,genre,bpm,musical_key,need,owner_id,hook_start,hook_end,published_at,profiles!projects_owner_id_fkey(username,display_name)').eq('publication_status','published').eq('moderation_hidden',false).order('published_at',{ascending:false}).limit(100);
  if(owner)query=query.eq('owner_id',owner);if(ids)query=query.in('id',ids);
  const {data,error}=await query;check(error);
  return (data??[]).map((p:any)=>{const u=Array.isArray(p.profiles)?p.profiles[0]:p.profiles;return {...p,username:u?.username??'artista',artist_name:u?.display_name||u?.username||'Artista'} as FeedItem;});
 }
 async saved(user:AuthUser){const {data,error}=await db.from('entra_saved_projects').select('project_id').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);check(error);return this.publications(undefined,(data??[]).map(r=>r.project_id));}
 async saveProject(id:number,user:AuthUser,save:boolean){
  if(!save){const {error}=await db.from('entra_saved_projects').delete().eq('user_id',user.id).eq('project_id',id);check(error);return;}
  const visible=await db.from('projects').select('id').eq('id',id).eq('publication_status','published').eq('moderation_hidden',false).maybeSingle();check(visible.error);if(!visible.data)throw new ValidationError('Esta publicación ya no está disponible.');
  const {error}=await db.from('entra_saved_projects').upsert({user_id:user.id,project_id:id},{onConflict:'user_id,project_id',ignoreDuplicates:true});check(error);
 }
 async collaborations(user:AuthUser){
  const {data,error}=await db.from('entra_collaborations').select('id,proposal_id,project_id,artist_id,collaborator_id,status,created_at,projects(title)').or('artist_id.eq.'+user.id+',collaborator_id.eq.'+user.id).order('created_at',{ascending:false}).limit(100);check(error);
  const rows=data as unknown as Collaboration[];if(!rows.length)return rows;
  const ids=[...new Set(rows.map(c=>c.artist_id===user.id?c.collaborator_id:c.artist_id))];
  const names=await db.from('profiles').select('id,username,display_name').in('id',ids);check(names.error);
  return rows.map(c=>{const artist=names.data?.find(a=>a.id===(c.artist_id===user.id?c.collaborator_id:c.artist_id));return {...c,counterpart_name:artist?.display_name||artist?.username||'Artista',counterpart_username:artist?.username};});
 }
 async closeCollaboration(id:number,user:AuthUser,status:string){
  if(!['completed','cancelled'].includes(status))throw new ValidationError('Selecciona un estado válido.');
  const {data,error}=await db.from('entra_collaborations').update({status}).eq('id',id).eq('status','active').or('artist_id.eq.'+user.id+',collaborator_id.eq.'+user.id).select('id');
  if(error?.code==='23514')throw new ValidationError('Esta colaboración ya está cerrada.');check(error);if(!data?.length)throw new ValidationError('Colaboración no encontrada o ya cerrada.');
 }
 async unreadCount(user:AuthUser){const {count,error}=await db.from('entra_notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).is('read_at',null);check(error);return count??0;}
 async notifications(user:AuthUser){const {data,error}=await db.from('entra_notifications').select('id,kind,message,read_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);check(error);return data as Notification[];}
 async markRead(user:AuthUser,id?:number){let q=db.from('entra_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);if(id)q=q.eq('id',id);const {error}=await q;check(error);}
 async report(id:number,user:AuthUser,reason:string){
  reason=reason.trim();if(reason.length<10||reason.length>500)throw new ValidationError('Describe el problema en entre 10 y 500 caracteres.');
  const visible=await db.from('projects').select('id').eq('id',id).eq('publication_status','published').eq('moderation_hidden',false).maybeSingle();check(visible.error);if(!visible.data)throw new ValidationError('La publicación ya no está disponible.');
  const {error}=await db.from('entra_reports').insert({reporter_id:user.id,project_id:id,reason});if(error?.code==='23505')throw new ValidationError('Ya reportaste esta publicación.');check(error);
 }
 async moderationProject(id:number,user:AuthUser){requireAdmin(user);const {data,error}=await db.from('projects').select('id,title,moderation_hidden,moderation_reason').eq('id',id).maybeSingle();check(error);return data;}
 async reports(user:AuthUser){requireAdmin(user);const {data,error}=await db.from('entra_reports').select('id,project_id,reason,status,created_at,projects(title,moderation_hidden,moderation_reason)').order('created_at',{ascending:false}).limit(100);check(error);return data as unknown as Report[];}
 async moderate(user:AuthUser,id:number,hidden:boolean,reason:string){requireAdmin(user);if(reason.trim().length<10||reason.trim().length>500)throw new ValidationError('Explica el motivo en entre 10 y 500 caracteres.');const {error}=await db.rpc('entra_moderate_project',{p_actor:user.id,p_project:id,p_hidden:hidden,p_reason:reason.trim()});check(error);}
 async dismiss(user:AuthUser,id:number){requireAdmin(user);const {error}=await db.from('entra_reports').update({status:'dismissed',resolved_by:user.id,resolved_at:new Date().toISOString()}).eq('id',id).eq('status','open');check(error);}
}
