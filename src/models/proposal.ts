import {supabaseAdmin as db} from '../config/supabase.ts';
import {parseBuffer} from 'music-metadata';
import {ValidationError} from './project.ts';
import type {AuthUser} from './user.ts';
export async function validateProposalAudio(file:File){
 if(!file.size||file.size>10*1024*1024)throw new ValidationError('Adjunta un audio de hasta 10 MB y 60 segundos.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 try{
  const {format}=await parseBuffer(bytes,{size:bytes.length},{duration:true});
  const duration=format.duration;
  const mime=format.container==='WAVE'?'audio/wav':format.codec?.includes('Layer 3')?'audio/mpeg':null;
  if(!mime||!duration||!Number.isFinite(duration)||duration<.5||duration>60.1)throw new Error();
  return {bytes,duration,mime};
 }catch{throw new ValidationError('La propuesta debe ser un WAV o MP3 válido de 0,5 a 60 segundos.');}
}
export type Proposal={id:number;project_id:number;applicant_id:string;recipient_id:string;message:string;audio_mime:string|null;audio_duration:number|null;status:'pending'|'accepted'|'rejected';created_at:string;projects:{title:string}|null;artist_name?:string};
export class ProposalModel{
 async create(project:number,user:AuthUser,message:string,file?:File){
  message=message.trim();if(message.length<5||message.length>1000)throw new ValidationError('Describe tu aporte en entre 5 y 1000 caracteres.');
  const audio=file?await validateProposalAudio(file):null;
  const {data,error}=await db.rpc('entra_submit_proposal',{p_actor:user.id,p_project:project,p_message:message,p_audio:audio?'\\x'+Buffer.from(audio.bytes).toString('hex'):null,p_mime:audio?.mime??null,p_duration:audio?.duration??null});
  if(error){if(['23505','22023','42501','P0002'].includes(error.code))throw new ValidationError(error.code==='23505'?'Ya enviaste una propuesta a este proyecto.':error.message);throw new Error('No se pudo guardar la propuesta. Revisa la migración de propuestas.');}
  return data as number;
 }
 async list(user:AuthUser){
  const {data,error}=await db.from('entra_proposals').select('id,project_id,applicant_id,recipient_id,message,audio_mime,audio_duration,status,created_at,projects(title)').or('applicant_id.eq.'+user.id+',recipient_id.eq.'+user.id).order('created_at',{ascending:false}).limit(100);
  if(error)throw new Error('No se pudieron cargar las propuestas. Aplica 20261118_audio_proposals.sql.');
  const rows=(data??[]) as unknown as Proposal[];
  const ids=[...new Set(rows.flatMap(p=>[p.applicant_id,p.recipient_id]))];
  if(!ids.length)return rows;
  const names=await db.from('profiles').select('id,username,display_name').in('id',ids);
  if(names.error)throw new Error('No se pudieron consultar los artistas.');
  return rows.map(p=>({...p,artist_name:names.data.find(n=>n.id===(p.recipient_id===user.id?p.applicant_id:p.recipient_id))?.display_name||names.data.find(n=>n.id===(p.recipient_id===user.id?p.applicant_id:p.recipient_id))?.username||'Artista'}));
 }
 async audio(id:number,user:AuthUser){
  const {data,error}=await db.from('entra_proposals').select('audio_bytes,audio_mime').eq('id',id).or('applicant_id.eq.'+user.id+',recipient_id.eq.'+user.id).maybeSingle();
  if(error)throw new Error('No se pudo leer la propuesta.');if(!data?.audio_bytes)return;
  if(typeof data.audio_bytes!=='string'||!/^\\x(?:[0-9a-f]{2})+$/i.test(data.audio_bytes))throw new Error('Audio inválido.');
  return {bytes:new Uint8Array(Buffer.from(data.audio_bytes.slice(2),'hex')),mime:data.audio_mime as string};
 }
 async decide(id:number,status:string,user:AuthUser){
  if(!['accepted','rejected'].includes(status))throw new ValidationError('Decisión inválida.');
  const {data,error}=await db.from('entra_proposals').update({status,decided_at:new Date().toISOString()}).eq('id',id).eq('recipient_id',user.id).eq('status','pending').select('id');
  if(error)throw new Error('No se pudo actualizar la propuesta.');return !!data?.length;
 }
}
