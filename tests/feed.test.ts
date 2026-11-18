import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.ts';
import {FeedModel,parseFeedCursor} from '../src/models/feed.ts';
import type {FeedItem} from '../src/models/feed.ts';
import {ProjectModel} from '../src/models/project.ts';
import type {Project,ProjectInput} from '../src/models/project.ts';
import {requirePublishable,publicationIssues} from '../src/models/publication.ts';
import {UserModel} from '../src/models/user.ts';
import {CatalogModel} from '../src/models/catalog.ts';

const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const user={id:owner,username:'luz',role:'artist'};
const ready:Project={id:1,ownerId:owner,title:'Ciudad de noche',genre:'Pop',genreId:1,instrumentId:2,collaborationId:3,bpm:120,musicalKey:'La menor',need:'Coro · Voz',description:'',status:'Buscando colaboración',audioName:'demo.mp3',audioDuration:60,hookStart:10,hookEnd:20,updatedAt:'',publicationStatus:'draft'};
const item:FeedItem={id:1,owner_id:owner,title:'Ciudad <segura>',genre:'Pop',bpm:120,musical_key:'La menor',need:'Coro · Voz',username:'luz',artist_name:'Luz Azul',hook_start:10,hook_end:20,published_at:'2026-11-17T12:00:00.123456+00:00'};
const catalogs={list:async()=>[{id:1,kind:'genre',name:'Pop',active:true,parent_id:null},{id:2,kind:'instrument',name:'Voz',active:true,parent_id:null},{id:3,kind:'collaboration',name:'Coro',active:true,parent_id:2}]} as CatalogModel;
const users={getSession:async(id:string)=>['owner','other','admin'].includes(id)?{userId:id==='other'?other:owner,username:id,role:id==='admin'?'superadmin':'artist',csrfToken:'token'}:undefined} as unknown as UserModel;
async function withApp(deps:Parameters<typeof createApp>[0],run:(base:string)=>Promise<void>){
 const {server}=createApp({userModel:users,catalogModel:catalogs,...deps});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 try{await run('http://127.0.0.1:'+address.port);}finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
}
const request=(base:string,path:string,account='owner',fields?:Record<string,string>)=>fetch(base+path,{method:fields?'POST':'GET',headers:{Cookie:'entra_session='+account},body:fields?new URLSearchParams(fields):undefined,redirect:'manual'});

test('Publicar exige audio, referencias y hook completo dentro de la duración',()=>{
 assert.deepEqual(publicationIssues(ready),[]);
 for(const change of [{audioName:null},{audioDuration:null},{hookStart:null},{hookStart:-1},{hookEnd:99},{hookEnd:10},{genreId:null},{instrumentId:null},{collaborationId:null}]) assert.throws(()=>requirePublishable({...ready,...change}));
});
test('Cursor mantiene precisión temporal y rechaza entradas alteradas',()=>{
 const cursor={time:item.published_at,id:1};
 assert.deepEqual(parseFeedCursor(Buffer.from(JSON.stringify(cursor)).toString('base64url')),cursor);
 assert.equal(parseFeedCursor(null),null);
 for(const value of ['inválido','a'.repeat(300),Buffer.from('{"time":"x","id":1}').toString('base64url'),Buffer.from('{"time":"2026-11-17T12:00:00Z","id":-1}').toString('base64url')]) assert.throws(()=>parseFeedCursor(value));
});
test('Modelos reales: feed paginado sin bytes y consultas de lectura/escritura privadas conservan el autor',async()=>{
 const original=globalThis.fetch;
 const calls:{url:URL;body:string;method:string}[]=[];
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));calls.push({url,body:String(init?.body??''),method:init?.method??'GET'});
  const data=url.pathname.includes('entra_feed_page')?Array.from({length:9},(_,n)=>({...item,id:20-n})):null;
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  const page=await new FeedModel().list();
  assert.equal(page.items.length,8);assert.ok(page.nextCursor);assert.equal(parseFeedCursor(page.nextCursor)?.id,13);
  assert.equal(JSON.parse(calls.at(-1)!.body).p_limit,9);
  await new FeedModel().audio(1);
  assert.equal(calls.at(-1)!.url.searchParams.get('publication_status'),'eq.published');
  const projects=new ProjectModel();
  await projects.find(1,user);assert.equal(calls.at(-1)!.url.searchParams.get('owner_id'),'eq.'+owner);
  await projects.audio(1,user);assert.equal(calls.at(-1)!.url.searchParams.get('owner_id'),'eq.'+owner);
  await projects.update(1,ready,user);assert.equal(calls.at(-1)!.url.searchParams.get('owner_id'),'eq.'+owner);
  assert.equal('owner_id' in JSON.parse(calls.at(-1)!.body),false);
  await projects.delete(1,user);assert.equal(calls.at(-1)!.url.searchParams.get('owner_id'),'eq.'+owner);
 }finally{globalThis.fetch=original;}
});
test('Feed: sesión, datos escapados, paginación, audio publicado y edición ajena bloqueada',async()=>{
 const feed={list:async(cursor:string|null)=>{parseFeedCursor(cursor);return {items:[item],nextCursor:null};},audio:async(id:number)=>id===1?new Uint8Array([1,2,3,4]):undefined} as unknown as FeedModel;
 const projects={find:async(_id:number,viewer:{id:string})=>viewer.id===owner?ready:undefined,audio:async(_id:number,viewer:{id:string})=>viewer.id===owner?new Uint8Array([1]):undefined} as unknown as ProjectModel;
 await withApp({feedModel:feed,model:projects},async base=>{
  for(const path of ['/feed','/feed/page','/feed/1/audio'])assert.equal((await request(base,path,'')).status,303);
  const page=await(await request(base,'/feed','other')).text();
  assert.match(page,/Ciudad &lt;segura&gt;/);assert.match(page,/Luz Azul/);assert.match(page,/Coro · Voz/);assert.match(page,/data-start="10"/);
  assert.doesNotMatch(page,/href="\/(?:admin\/)?projects\/1\/edit"/);assert.doesNotMatch(page,/href="\/admin"/);
  assert.match(await(await request(base,'/feed','owner')).text(),/href="\/projects\/1\/edit"/);
  assert.equal((await request(base,'/feed?cursor=invalido','owner')).status,422);
  const json=await(await request(base,'/feed/page','other')).json();assert.match(json.html,/data-feed-card/);assert.equal(json.nextCursor,null);
  assert.equal((await request(base,'/feed','other',{})).status,405);
  const audio=await fetch(base+'/feed/1/audio',{headers:{Cookie:'entra_session=other',Range:'bytes=1-2'}});
  assert.equal(audio.status,206);assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[2,3]);
  assert.equal((await request(base,'/feed/2/audio','other')).status,404);
  for(const path of ['/projects/1','/projects/1/edit','/projects/1/audio'])assert.equal((await request(base,path,'other')).status,404);
  assert.equal((await request(base,'/projects/1/publish','other',{csrf:'token'})).status,404);
 });
});
test('Ciclo de publicación: borrador por defecto, confirmación, CSRF, publicar y retirar',async()=>{
 const project={...ready};let mutations=0;let created:ProjectInput|undefined;
 const model={
  list:async()=>[project],
  find:async(id:number,viewer:{id:string;role:string})=>id===1&&(viewer.id===owner||viewer.role==='superadmin')?project:undefined,
  create:async(input:ProjectInput)=>{created=input;return 2;},
  setPublication:async(_id:number,published:boolean)=>{if(published)requirePublishable(project);project.publicationStatus=published?'published':'draft';mutations++;return true;}
 } as unknown as ProjectModel;
 await withApp({model},async base=>{
  const fields={csrf:'token',title:'Idea nueva',genreId:'1',instrumentId:'2',collaborationId:'3',bpm:'120',musicalKey:'La menor',status:'Borrador',publication_status:'published'};
  assert.equal((await request(base,'/projects','owner',fields)).status,303);
  assert.ok(created);assert.equal('publication_status' in created,false);
  const preview=await(await request(base,'/projects/1/publish')).text();
  assert.match(preview,/Publicar en Descubrir/);assert.equal(mutations,0);
  assert.equal((await request(base,'/projects/1/publish','owner',{csrf:'bad'})).status,403);
  assert.equal((await request(base,'/projects/1/publish','other',{csrf:'token'})).status,404);assert.equal(mutations,0);
  project.audioName=null;
  const incomplete=await request(base,'/projects/1/publish','owner',{csrf:'token'});assert.equal(incomplete.status,422);assert.equal(mutations,0);
  project.audioName='demo.mp3';
  assert.equal((await request(base,'/projects/1/publish','owner',{csrf:'token'})).headers.get('location'),'/projects?result=published');
  assert.equal(project.publicationStatus,'published');assert.equal(mutations,1);
  assert.equal((await request(base,'/projects/1/unpublish')).status,405);assert.equal(mutations,1);
  assert.equal((await request(base,'/projects/1/unpublish','owner',{csrf:'bad'})).status,403);
  assert.equal((await request(base,'/projects/1/unpublish','owner',{csrf:'token'})).headers.get('location'),'/projects?result=unpublished');
  assert.equal(project.publicationStatus,'draft');assert.equal(mutations,2);assert.equal(project.ownerId,owner);
 });
});
