import type {IncomingMessage,ServerResponse} from 'node:http';
import {ProposalModel} from '../models/proposal.ts';
import type {AuthUser} from '../models/user.ts';
import {ValidationError} from '../models/project.ts';
import {html} from './project-controller.ts';
import {sendAudio} from './audio-response.ts';
import {layout,escapeHtml as e} from '../views/layout.ts';
export async function proposalController(req:IncomingMessage,res:ServerResponse,url:URL,model:ProposalModel,user:AuthUser,token:string){
 const json=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 try{
  const audio=url.pathname.match(/^\/proposals\/([1-9]\d*)\/audio$/);
  if(req.method==='GET'&&audio){const clip=await model.audio(Number(audio[1]),user);if(!clip){html(res,'Propuesta no encontrada.',404);return;}sendAudio(req,res,clip.bytes,clip.mime);return;}
  if(req.method==='POST'){
   const create=url.pathname.match(/^\/proposals\/project\/([1-9]\d*)$/),decide=url.pathname.match(/^\/proposals\/([1-9]\d*)\/decision$/);
   if(!create&&!decide){json({error:'Ruta no encontrada.'},404);return;}
   const parts:Buffer[]=[];let size=0;
   for await(const part of req){size+=part.length;if(size>10*1024*1024+16384)throw new ValidationError('La propuesta supera 10 MB.');parts.push(Buffer.from(part));}
   const type=req.headers['content-type']??'';
   const form=await new Response(Buffer.concat(parts),{headers:{'Content-Type':type}}).formData().catch(()=>{throw new ValidationError('Formulario inválido.');});
   if(form.get('csrf')!==token){json({error:'La sesión cambió. Recarga la página antes de enviar.'},403);return;}
   if(create){const file=form.get('audio');const id=await model.create(Number(create[1]),user,String(form.get('message')??''),file instanceof File&&file.size?file:undefined);json({id,url:'/proposals'},201);return;}
   if(!await model.decide(Number(decide![1]),String(form.get('status')??''),user)){html(res,'Propuesta no encontrada o ya revisada.',404);return;}
   res.writeHead(303,{Location:'/proposals'});res.end();return;
  }
  if(req.method!=='GET'){res.setHeader('Allow','GET, POST');json({error:'Método no permitido.'},405);return;}
  if(url.pathname!=='/proposals'){html(res,'Propuesta no encontrada.',404);return;}
  const rows=await model.list(user);
  const group=(received:boolean)=>rows.filter(p=>(p.recipient_id===user.id)===received).map(p=>'<article class="admin-records__item"><div><p class="eyebrow">'+({pending:'Pendiente',accepted:'Aceptada',rejected:'Rechazada'}[p.status])+'</p><h2>'+e(p.projects?.title??'Proyecto')+'</h2><p>'+e(received?'De '+p.artist_name:'Para '+p.artist_name)+'</p><p class="detail__description">'+e(p.message)+'</p>'+(p.audio_duration?'<audio controls preload="none" src="/proposals/'+p.id+'/audio" aria-label="Propuesta para '+e(p.projects?.title)+'"></audio><p class="muted">'+Math.round(p.audio_duration)+' segundos</p>':'<p class="muted">Propuesta sin muestra de audio.</p>')+'<p class="muted">'+e(new Date(p.created_at).toLocaleDateString('es-EC',{timeZone:'America/Guayaquil'}))+'</p></div>'+(received&&p.status==='pending'?'<form method="post" action="/proposals/'+p.id+'/decision"><input type="hidden" name="csrf" value="'+e(token)+'"><button class="button button--primary" name="status" value="accepted">Aceptar</button> <button class="button" name="status" value="rejected">Rechazar</button></form>':'')+'</article>').join('')||'<p class="empty">Todavía no hay propuestas '+(received?'recibidas':'enviadas')+'.</p>';
  html(res,layout('<section class="heading"><div><p class="eyebrow">DEL HOOK A LA CONEXIÓN</p><h1>Propuestas</h1><p class="muted">Escucha los aportes y decide con quién seguir creando.</p></div></section><h2>Recibidas</h2><div class="admin-records">'+group(true)+'</div><h2 class="proposal-section-title">Enviadas</h2><div class="admin-records">'+group(false)+'</div>',token,'proposals',user.role));
 }catch(error){if(error instanceof ValidationError){json({error:error.message},422);return;}throw error;}
}
