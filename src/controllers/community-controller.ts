import type {IncomingMessage,ServerResponse} from 'node:http';
import {CommunityModel} from '../models/community.ts';
import type {AuthUser} from '../models/user.ts';
import {CatalogModel} from '../models/catalog.ts';
import {ValidationError} from '../models/project.ts';
import {html,readForm} from './project-controller.ts';
import {layout,escapeHtml as e} from '../views/layout.ts';
import {feedView} from '../views/feed.ts';
import {profileView,profileForm,libraryView,notificationsView,reportView,reportsView,artistsDirectory,moderationView} from '../views/community.ts';
const id=(value:string)=>{const n=Number(value);if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(n))throw new ValidationError('Identificador inválido.');return n;};
export async function communityController(req:IncomingMessage,res:ServerResponse,url:URL,model:CommunityModel,catalogs:CatalogModel,user:AuthUser,token:string){
 const path=url.pathname,redirect=(to:string)=>{res.writeHead(303,{Location:to});res.end();};
 try{
  if(path.startsWith('/admin/reports')&&user.role!=='superadmin'){html(res,'Acceso exclusivo del administrador.',403);return;}
  if(req.method==='POST'){
   const fields=await readForm(req);if(fields.get('csrf')!==token){html(res,'Formulario caducado. Recarga la página.',403);return;}
   if(path==='/profile/edit'){
    const profile=await model.profile(user.username);if(!profile){html(res,'Perfil no encontrado.',404);return;}
    const items=await catalogs.list();try{await model.saveProfile(user,fields,items);}catch(error){if(!(error instanceof ValidationError))throw error;html(res,profileForm(profile,items,token,user,error.message,fields),422);return;}redirect('/profile');return;
   }
   const saved=path.match(/^\/library\/([1-9]\d*)\/(save|remove)$/);if(saved){await model.saveProject(id(saved[1]),user,saved[2]==='save');redirect('/library?tab=saved');return;}
   const collaboration=path.match(/^\/collaborations\/([1-9]\d*)$/);if(collaboration){await model.closeCollaboration(id(collaboration[1]),user,fields.get('status')??'');redirect('/library?tab=collaborations');return;}
   const read=path.match(/^\/notifications(?:\/([1-9]\d*))?\/read$/);if(read){await model.markRead(user,read[1]?id(read[1]):undefined);redirect('/notifications');return;}

  const report=path.match(/^\/reports\/project\/([1-9]\d*)$/);if(report){await model.report(id(report[1]),user,fields.get('reason')??'');html(res,layout('<h1>Reporte recibido</h1><p>Administración revisará esta publicación.</p><a class="button" href="/feed">Volver a Descubrir</a>',token,'feed',user.role));return;}
   const directModerate=path.match(/^\/admin\/reports\/project\/([1-9]\d*)\/moderate$/);if(directModerate){if(!['true','false'].includes(fields.get('hidden')??''))throw new ValidationError('Acción inválida.');await model.moderate(user,id(directModerate[1]),fields.get('hidden')==='true',fields.get('reason')??'');redirect('/admin/reports?updated=1');return;}
   const moderate=path.match(/^\/admin\/reports\/([1-9]\d*)\/moderate$/);if(moderate){if(!['true','false'].includes(fields.get('hidden')??''))throw new ValidationError('Acción inválida.');await model.moderate(user,id(fields.get('projectId')??''),fields.get('hidden')==='true',fields.get('reason')??'');redirect('/admin/reports?updated=1');return;}
   const dismiss=path.match(/^\/admin\/reports\/([1-9]\d*)\/dismiss$/);if(dismiss){await model.dismiss(user,id(dismiss[1]));redirect('/admin/reports?updated=1');return;}
   html(res,'Ruta no encontrada.',404);return;
  }
  if(req.method!=='GET'){res.setHeader('Allow','GET, POST');html(res,'Método no permitido.',405);return;}
  if(path==='/library'){const tab=url.searchParams.get('tab')==='collaborations'?'collaborations':'saved';html(res,libraryView(tab==='saved'?await model.saved(user):[],tab==='collaborations'?await model.collaborations(user):[],tab,token,user));return;}
  if(path==='/notifications/count'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({count:await model.unreadCount(user)}));return;}
  if(path==='/notifications'){html(res,notificationsView(await model.notifications(user),token,user));return;}
  if(path==='/artists'){html(res,artistsDirectory(await model.artists(),token,user));return;}
  if(path==='/admin/reports'){html(res,reportsView(await model.reports(user),token,url.searchParams.has('updated')?'Moderación actualizada.':''));return;}
  const moderation=path.match(/^\/admin\/reports\/project\/([1-9]\d*)$/);if(moderation){const p=await model.moderationProject(id(moderation[1]),user);if(!p){html(res,'Proyecto no encontrado.',404);return;}html(res,moderationView(p,token));return;}
  const report=path.match(/^\/reports\/project\/([1-9]\d*)$/);
  const discover=path.match(/^\/discover\/([1-9]\d*)$/);
  if(report||discover){const items=await model.publications(undefined,[id((report??discover)![1])]);const p=items[0];if(!p){html(res,'Publicación no disponible.',404);return;}html(res,report?reportView(p.id,p.title,token,user):feedView({items,nextCursor:null},token,user.id,user.role));return;}
  const match=path.match(/^\/artists\/([^/]+)$/);
  if(path==='/profile'||path==='/profile/edit'||match){
   let username=user.username;if(match){try{username=decodeURIComponent(match[1]);}catch{throw new ValidationError('Artista inválido.');}}
   const profile=await model.profile(username);if(!profile){html(res,'Artista no encontrado.',404);return;}
   const items=await catalogs.list();html(res,path==='/profile/edit'?profileForm(profile,items,token,user):profileView(profile,await model.publications(profile.id),items,token,user));return;
  }
  html(res,'Página no encontrada.',404);
 }catch(error){if(!(error instanceof ValidationError))throw error;html(res,layout('<h1>No se pudo guardar</h1><p role="alert">'+e(error.message)+'</p><a class="button" href="'+(path.startsWith('/admin')?'/admin/reports':path.startsWith('/profile')?'/profile/edit':'/library')+'">Volver</a>',token,'library',user.role),422);}
}
