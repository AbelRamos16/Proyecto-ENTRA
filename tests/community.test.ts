import {test} from 'node:test';import assert from 'node:assert/strict';
import {createApp} from '../src/server.ts';import {CommunityModel,validatePreferences} from '../src/models/community.ts';import {parseDiscoverFilters} from '../src/models/feed.ts';
import type {CatalogModel,CatalogItem} from '../src/models/catalog.ts';import {UserModel} from '../src/models/user.ts';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const items:CatalogItem[]=[{id:1,kind:'genre',name:'Pop',parent_id:null,active:true},{id:2,kind:'instrument',name:'Voz',parent_id:null,active:true},{id:3,kind:'instrument',name:'Inactivo',parent_id:null,active:false}];
const fields=(values:Record<string,string|undefined>)=>{const p=new URLSearchParams();for(const [key,value] of Object.entries(values))if(value!==undefined)p.set(key,value);return p;};
test('Preferencias: lista explícita, opciones activas y límite de selección',()=>{
 const input=fields({displayName:'Luz Azul',bio:'Música',instruments:'2',genres:'1',role:'superadmin',username:'intruso'});const saved=validatePreferences(input,items);assert.deepEqual(saved.instrument_ids,[2]);assert.equal('role' in saved,false);assert.equal('username' in saved,false);
 for(const instruments of ['999','3','-1','x'])assert.throws(()=>validatePreferences(fields({displayName:'Luz',instruments}),items));
});
test('Búsqueda: género/instrumento válidos, rango BPM coherente y estados existentes',()=>{
 assert.equal(parseDiscoverFilters(new URLSearchParams()),undefined);assert.equal(parseDiscoverFilters(fields({genre:'1',instrument:'2',min:'80',max:'120',state:'En producción'}))?.min,80);
 for(const v of [{min:'130',max:'90'},{min:'0'},{genre:'NaN'},{state:'inventado'},{q:'a'.repeat(81)}])assert.throws(()=>parseDiscoverFilters(fields(v)));
});
test('Comunidad HTTP: edición propia, CSRF, filtros de rol y cierres',async()=>{
 let writes=0;const profile={id:owner,username:'luz',display_name:'Luz Azul',bio:'Mi bio',instrument_ids:[2],genre_ids:[1]};
 const model={profile:async()=>profile,publications:async()=>[],artists:async()=>[profile],saveProfile:async(user:{id:string},f:URLSearchParams)=>{assert.equal(user.id,owner);validatePreferences(f,items);writes++;},saved:async()=>[],collaborations:async()=>[],notifications:async()=>[],reports:async()=>[],moderationProject:async()=>({id:1,title:'Ejemplo',moderation_hidden:false,moderation_reason:''}),markRead:async(user:{id:string})=>{assert.equal(user.id,owner);writes++;},saveProject:async()=>{},report:async()=>{},closeCollaboration:async()=>{writes++;},moderate:async()=>{writes++;},dismiss:async()=>{writes++;}} as unknown as CommunityModel;
 const users={getSession:async(id:string)=>id==='none'?undefined:{userId:id==='other'?other:owner,username:'luz',role:id==='admin'?'superadmin':'user',csrfToken:'token'}} as unknown as UserModel;
 const {server}=createApp({communityModel:model,userModel:users,catalogModel:{list:async()=>items} as CatalogModel});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();assert.ok(a&&typeof a!=='string');const base='http://127.0.0.1:'+a.port;
 const call=(path:string,account='owner',data?:Record<string,string>)=>fetch(base+path,{method:data?'POST':'GET',headers:{Cookie:'entra_session='+account},body:data?fields(data):undefined,redirect:'manual'});
 try{
  for(const path of ['/profile','/profile/edit','/artists','/library','/notifications'])assert.equal((await call(path,'none')).status,303);
  const own=await(await call('/profile')).text();assert.match(own,/Luz Azul/);assert.match(own,/Editar mi perfil/);assert.doesNotMatch(own,/href="\/admin"/);
  assert.equal((await call('/profile/edit','owner',{csrf:'bad',displayName:'Luz'})).status,403);assert.equal(writes,0);
  assert.equal((await call('/profile/edit','owner',{csrf:'token',displayName:'Luz Azul',instruments:'2',genres:'1'})).status,303);assert.equal(writes,1);
  assert.equal((await call('/admin/reports','owner')).status,403);assert.equal((await call('/admin/reports','admin')).status,200);assert.equal((await call('/admin/reports/project/1','admin')).status,200);assert.equal((await call('/admin/reports/project/1','owner')).status,403);
  assert.equal((await call('/admin/reports/1/moderate','owner',{csrf:'token',projectId:'1',reason:'Reporte de prueba',hidden:'true'})).status,403);assert.equal(writes,1);
  assert.equal((await call('/notifications/read','owner',{csrf:'token'})).status,303);assert.equal(writes,2);
  assert.equal((await call('/library?tab=collaborations')).status,200);assert.equal((await call('/discover/99')).status,404);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('Modelos comunidad: audio invisible, filtros de propietario y participante en escrituras',async()=>{
 const original=globalThis.fetch,calls:{url:URL;body:Record<string,unknown>;method:string}[]=[];
 globalThis.fetch=async(input,init)=>{const url=new URL(String(input));calls.push({url,body:init?.body?JSON.parse(String(init.body)):{},method:init?.method??'GET'});return new Response(JSON.stringify(url.pathname.endsWith('profiles')?[]:url.pathname.endsWith('entra_collaborations')?[{id:1}]:[]),{headers:{'Content-Type':'application/json'}});};
 const model=new CommunityModel(),user={id:owner,username:'luz',role:'user'};
 try{
  await model.saveProfile(user,fields({displayName:'Luz Azul',role:'superadmin'}),items);assert.equal(calls.at(-1)!.url.searchParams.get('id'),'eq.'+owner);assert.equal('role' in calls.at(-1)!.body,false);
  await model.markRead(user,2);assert.equal(calls.at(-1)!.url.searchParams.get('user_id'),'eq.'+owner);assert.equal(calls.at(-1)!.url.searchParams.get('id'),'eq.2');
  await model.closeCollaboration(1,user,'completed');assert.ok(calls.at(-1)!.url.searchParams.get('or')!.includes(owner));assert.equal(calls.at(-1)!.url.searchParams.get('status'),'eq.active');
  await model.publications(owner);assert.equal(calls.at(-1)!.url.searchParams.get('moderation_hidden'),'eq.false');assert.equal(calls.at(-1)!.url.searchParams.get('owner_id'),'eq.'+owner);assert.ok(!calls.at(-1)!.url.searchParams.get('select')!.includes('audio_bytes'));
 }finally{globalThis.fetch=original;}
});

test('Login: mayúsculas no cambian la identidad y comodines se tratan literalmente',async()=>{
 const original=globalThis.fetch,urls:URL[]=[];globalThis.fetch=async input=>{urls.push(new URL(String(input)));return new Response('null',{headers:{'Content-Type':'application/json'}});};
 try{const users=new UserModel();assert.equal(await users.authenticate('AbelRamos','ejemplo'),undefined);assert.equal(urls.at(-1)!.searchParams.get('username'),'ilike.AbelRamos');await users.authenticate('demo_x%','ejemplo');assert.equal(urls.at(-1)!.searchParams.get('username'),'ilike.demo\\_x\\%');}finally{globalThis.fetch=original;}
});
