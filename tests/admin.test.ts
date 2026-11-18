import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.ts';
import { AdminModel, requireAdmin } from '../src/models/admin.ts';
import { CatalogModel, resolveSelection, validateCatalog } from '../src/models/catalog.ts';
import type { CatalogItem } from '../src/models/catalog.ts';
import { UserModel } from '../src/models/user.ts';
import { ProjectModel } from '../src/models/project.ts';
import type { ProjectInput } from '../src/models/project.ts';
const items: CatalogItem[] = [
 {id:1,kind:'genre',name:'Jazz',parent_id:null,active:true},
 {id:2,kind:'instrument',name:'Voz',parent_id:null,active:true},
 {id:3,kind:'instrument',name:'Bajo',parent_id:null,active:true},
 {id:4,kind:'collaboration',name:'Coro',parent_id:2,active:true},
 {id:5,kind:'collaboration',name:'Línea de bajo',parent_id:3,active:true},
 {id:6,kind:'genre',name:'Inactivo',parent_id:null,active:false},
];
const catalogs = {list:async()=>items} as CatalogModel;
const userModel = {getSession:async(id:string)=> ['admin','artist'].includes(id) ? {id,userId:'11111111-1111-4111-8111-111111111111',username:id,role:id==='admin'?'superadmin':'artist',csrfToken:'token'} : undefined} as unknown as UserModel;
const selection = {genreId:'1',instrumentId:'2',collaborationId:'4'};
async function withServer(deps: Parameters<typeof createApp>[0], run:(base:string)=>Promise<void>) {
 const {server}=createApp({userModel,catalogModel:catalogs,...deps});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address && typeof address!=='string');
 try {await run(`http://127.0.0.1:${address.port}`);} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const request=(base:string,path:string,role='admin',fields?:Record<string,string>)=>fetch(base+path,{method:fields?'POST':'GET',headers:{Cookie:`entra_session=${role}`},body:fields?new URLSearchParams(fields):undefined,redirect:'manual'});
test('Backend rechaza referencias inventadas, inactivas y colaboración de otro instrumento',()=>{
 assert.throws(()=>requireAdmin({id:'x',username:'x',role:'artist'}));
 assert.throws(()=>validateCatalog(new URLSearchParams({kind:'genre',name:'<script>'})));
 assert.throws(()=>validateCatalog(new URLSearchParams({kind:'collaboration',name:'Coro',parentId:'inventado'})));
 assert.equal(validateCatalog(new URLSearchParams({kind:'genre',name:'  Jazz  fusión '})).name,'Jazz fusión');
 assert.throws(()=>resolveSelection(items,new URLSearchParams({...selection,genreId:'999'})));
 assert.throws(()=>resolveSelection(items,new URLSearchParams({...selection,genreId:'6'})));
 assert.throws(()=>resolveSelection(items,new URLSearchParams({...selection,instrumentId:'3'})));
 assert.equal(resolveSelection(items,new URLSearchParams(selection)).collaboration.name,'Coro');
});
test('Administración: sesión, rol, CSRF, selector relacionado, creación y actualización',async()=>{
 const writes:URLSearchParams[]=[];
 const adminModel={list:async()=>items,save:async(fields:URLSearchParams)=>{validateCatalog(fields);writes.push(fields);}} as unknown as AdminModel;
 await withServer({adminModel},async base=>{
  assert.equal((await request(base,'/admin','')).status,303);
  assert.equal((await request(base,'/admin','artist')).status,403);
  const page=await(await request(base,'/admin')).text();
  assert.match(page,/href="\/admin"/);
  assert.match(page,/<select name="parentId" required>/);
  assert.match(page,/Tipos de colaboración/);assert.doesNotMatch(page,/Guardar asignación/);
  const fields={csrf:'token',kind:'collaboration',name:'Puente',parentId:'2'};
  assert.equal((await request(base,'/admin/catalogs','admin',{...fields,csrf:'bad'})).status,403);
  assert.equal(writes.length,0);
  assert.equal((await request(base,'/admin/catalogs','admin',{...fields,name:'x'})).status,422);
  assert.equal(writes.length,0);
  assert.equal((await request(base,'/admin/catalogs','admin',fields)).status,303);
  assert.equal((await request(base,'/admin/catalogs','admin',{...fields,id:'4',active:'false'})).status,303);
  assert.equal(writes.length,2);
 });
});
test('CRUD usa catálogos, conserva selección y rechaza manipulación antes de escribir',async()=>{
 const writes:ProjectInput[]=[];
 const model={list:async()=>[],create:async(input:ProjectInput)=>{writes.push(input);return 1;}} as unknown as ProjectModel;
 await withServer({model},async base=>{
  for (const path of ['/projects', '/projects/new']) {
   assert.doesNotMatch(await(await request(base,path,'artist')).text(), /href="\/admin"/);
   assert.match(await(await request(base,path,'admin')).text(), /href="\/admin"/);
  }
  const page=await(await request(base,'/projects/new','artist')).text();
  assert.match(page,/name="genreId"/);assert.match(page,/data-parent="2"/);assert.doesNotMatch(page,/>Inactivo</);
  const fields={...selection,title:'Demo jazz',bpm:'120',musicalKey:'La menor',status:'Borrador',csrf:'token',genre:'Falso',need:'Texto manipulado'};
  const invalid=await request(base,'/projects','artist',{...fields,instrumentId:'3'});
  assert.equal(invalid.status,422);assert.equal(writes.length,0);
  assert.match(await invalid.text(),/value="3"[^>]*selected/);
  assert.equal((await request(base,'/projects','artist',{...fields,bpm:'999'})).status,422);
  assert.equal(writes.length,0);
  assert.equal((await request(base,'/projects','artist',fields)).status,303);
  assert.equal(writes[0].genre,'Jazz');assert.equal(writes[0].need,'Coro · Voz');
  assert.equal(writes[0].collaborationId,4);
 });
});
test('Hook fuera de la duración real se rechaza sin guardar',async()=>{
 let writes=0;
 const project={id:1,genreId:1,instrumentId:2,collaborationId:4,title:'Demo',genre:'Jazz',bpm:120,musicalKey:'La menor',need:'Coro',description:'',status:'Borrador',audioDuration:60,audioName:'demo.mp3',hookStart:10,hookEnd:20};
 const model={find:async()=>project,update:async()=>{writes++;return true;}} as unknown as ProjectModel;
 await withServer({model},async base=>{
  const response=await request(base,'/projects/1/edit','artist',{...selection,title:'Demo',bpm:'120',musicalKey:'La menor',status:'Borrador',csrf:'token',hookStart:'10',hookEnd:'90'});
  assert.equal(response.status,422);assert.match(await response.text(),/hook válido/);assert.equal(writes,0);
 });
});

test('Perfiles: datos públicos validados y lista explícita de campos editables', async()=>{
 const {validateArtistProfile,validateArtistId}=await import('../src/models/admin.ts');
 assert.throws(()=>validateArtistId('123'));
 assert.throws(()=>validateArtistProfile(new URLSearchParams({displayName:'x',bio:''})));
 assert.throws(()=>validateArtistProfile(new URLSearchParams({displayName:'<script>',bio:''})));
 assert.throws(()=>validateArtistProfile(new URLSearchParams({displayName:'Artista',bio:'x'.repeat(501)})));
 assert.deepEqual(validateArtistProfile(new URLSearchParams({displayName:'  Luz  Azul ',bio:'Una historia',role:'superadmin',username:'otro',password:'cambio'})),{display_name:'Luz Azul',bio:'Una historia'});
});
test('Artistas: búsqueda, ficha, permisos, CSRF, errores conservan campos y guardado',async()=>{
 const {validateArtistProfile}=await import('../src/models/admin.ts');
 const id='22222222-2222-4222-8222-222222222222';
 const artist={id,username:'luz',display_name:'Luz Azul',bio:'Cantante'};
 let saved:unknown;
 const adminModel={
  artists:async()=>[artist],
  artist:async(target:string)=>target===id?artist:undefined,
  saveArtist:async(_id:string,fields:URLSearchParams)=>{saved=validateArtistProfile(fields);return true;}
 } as unknown as AdminModel;
 const model={list:async()=>[]} as unknown as ProjectModel;
 await withServer({adminModel,model},async base=>{
  const path='/admin/artists/'+id;
  for(const route of ['/admin/artists',path,'/admin/projects']){
   assert.equal((await request(base,route,'artist')).status,403);
   assert.equal((await request(base,route,'')).status,303);
  }
  assert.match(await(await request(base,'/admin/artists')).text(),/Luz Azul/);
  assert.doesNotMatch(await(await request(base,'/admin/artists?q=SinCoincidencia')).text(),/Editar perfil y ver proyectos/);
  assert.equal((await request(base,'/admin/artists/invalido')).status,404);
  assert.equal((await request(base,'/admin/artists/33333333-3333-4333-8333-333333333333')).status,404);
  const page=await(await request(base,path)).text();
  assert.match(page,/name="displayName"/);assert.match(page,/name="bio"/);
  assert.doesNotMatch(page,/name="(role|password|email|username)"/);
  const fields={displayName:'Nueva Luz',bio:'<texto seguro>',csrf:'token',role:'superadmin'};
  assert.equal((await request(base,path,'artist',fields)).status,403);
  assert.equal((await request(base,path,'admin',{...fields,csrf:'bad'})).status,403);
  assert.equal(saved,undefined);
  const invalid=await request(base,path,'admin',{...fields,displayName:'x'});
  assert.equal(invalid.status,422);assert.match(await invalid.text(),/&lt;texto seguro&gt;/);
  assert.equal(saved,undefined);
  const result=await request(base,path,'admin',fields);
  assert.equal(result.status,303);assert.equal(result.headers.get('location'),path+'?saved=1');
  assert.deepEqual(saved,{display_name:'Nueva Luz',bio:'<texto seguro>'});
 });
});
test('Proyectos administrativos: revisar audio, editar sin transferir autor y eliminar con confirmación y CSRF',async()=>{
 const id='22222222-2222-4222-8222-222222222222';
 const artist={id,username:'luz',display_name:'Luz Azul',bio:''};
 const project={id:7,ownerId:id,genreId:1,instrumentId:2,collaborationId:4,title:'Demo de Luz',genre:'Jazz',bpm:120,musicalKey:'La menor',need:'Coro',description:'Demo',status:'Borrador',audioDuration:60,audioName:'demo.mp3',hookStart:10,hookEnd:20,updatedAt:''};
 const edits:ProjectInput[]=[];let deleted=0;let filter:string|undefined;
 const adminModel={artists:async()=>[artist]} as unknown as AdminModel;
 const model={
  list:async(_user:unknown,owner?:string)=>{filter=owner;return [project];},
  find:async(id:number)=>id===7?project:undefined,
  audio:async()=>new Uint8Array([1,2,3,4]),
  update:async(_id:number,input:ProjectInput)=>{edits.push(input);return true;},
  delete:async()=>{deleted++;return true;}
 } as unknown as ProjectModel;
 await withServer({adminModel,model},async base=>{
  assert.match(await(await request(base,'/admin/projects?artist='+id)).text(),/Luz Azul/);assert.equal(filter,id);
  for(const route of ['/admin/projects/7','/admin/projects/7/edit','/admin/projects/7/delete','/admin/projects/7/audio']) assert.equal((await request(base,route,'artist')).status,403);
  assert.equal((await request(base,'/admin/projects/99')).status,404);
  const detail=await(await request(base,'/admin/projects/7')).text();
  assert.match(detail,/src="\/admin\/projects\/7\/audio"/);
  const range=await fetch(base+'/admin/projects/7/audio',{headers:{Cookie:'entra_session=admin',Range:'bytes=1-2'}});
  assert.equal(range.status,206);assert.deepEqual([...new Uint8Array(await range.arrayBuffer())],[2,3]);
  const edit=await(await request(base,'/admin/projects/7/edit')).text();
  assert.match(edit,/action="\/admin\/projects\/7\/edit"/);
  const fields={...selection,title:'Demo editada',bpm:'120',musicalKey:'La menor',status:'Borrador',hookStart:'10',hookEnd:'20',csrf:'token',ownerId:'inventado'};
  assert.equal((await request(base,'/admin/projects/7/edit','admin',{...fields,csrf:'bad'})).status,403);
  assert.equal(edits.length,0);
  assert.equal((await request(base,'/admin/projects/7/edit','admin',{...fields,bpm:'999'})).status,422);
  const update=await request(base,'/admin/projects/7/edit','admin',fields);
  assert.equal(update.status,303);assert.equal(update.headers.get('location'),'/admin/projects?result=updated');
  assert.equal(edits[0].title,'Demo editada');assert.equal(edits[0].audio,undefined);assert.equal('ownerId' in edits[0],false);
  const confirmation=await(await request(base,'/admin/projects/7/delete')).text();
  assert.match(confirmation,/href="\/admin\/projects">Conservar proyecto/);assert.equal(deleted,0);
  assert.equal((await request(base,'/admin/projects/7/delete','artist',{csrf:'token'})).status,403);
  assert.equal((await request(base,'/admin/projects/7/delete','admin',{csrf:'bad'})).status,403);
  assert.equal(deleted,0);
  const removal=await request(base,'/admin/projects/7/delete','admin',{csrf:'token'});
  assert.equal(removal.status,303);assert.equal(removal.headers.get('location'),'/admin/projects?result=deleted');assert.equal(deleted,1);
 });
});
