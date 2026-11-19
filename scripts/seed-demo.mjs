import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {artists,tracks,DEMO_BATCH} from './demo/data.mjs';
import {renderDemo} from './demo/audio.mjs';

const args=process.argv.slice(2);
const argument=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
if(args.includes('--dry-run')){
 console.log(JSON.stringify({batch:DEMO_BATCH,artists:artists.length,publications:tracks.length,audio:'Instrumentales sintéticas originales, 16 segundos por demo',writes:false},null,2));
 process.exit(0);
}
const expected=argument('--project-ref');
if(!expected||!/^[a-z0-9]+$/.test(expected))throw new Error('Indica --project-ref para confirmar el proyecto de destino.');
const variables=parse(await readFile(resolve(argument('--env-file')??'.env')));
const url=variables.SUPABASE_URL,key=variables.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||!variables.SUPABASE_ANON_KEY)throw new Error('El archivo de entorno debe contener las tres variables Supabase.');
if(new URL(url).hostname!==expected+'.supabase.co')throw new Error('El archivo de entorno no corresponde al proyecto indicado.');
Object.assign(process.env,variables);
const {validateAudio}=await import('../src/models/audio.ts');
const {validateProject,ProjectModel}=await import('../src/models/project.ts');
const {resolveSelection}=await import('../src/models/catalog.ts');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const model=new ProjectModel();
const folder=resolve(dirname(fileURLToPath(import.meta.url)),'../.demo-data');
await mkdir(folder,{recursive:true});
const credentialsPath=join(folder,'credentials.private.json');
let manifest={batch:DEMO_BATCH,projectRef:expected,users:[],projects:[]};
try{manifest=JSON.parse(await readFile(credentialsPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(manifest.batch!==DEMO_BATCH||manifest.projectRef!==expected)throw new Error('El registro local pertenece a otra carga o proyecto.');
const persist=()=>writeFile(credentialsPath,JSON.stringify(manifest,null,2)+'\n');
const check=(error,action)=>{if(error)throw new Error(action+': '+error.message);};

// Preflight de lectura: no crear cuentas si falta el esquema del feed.
for(const [table,columns] of [['profiles','id,username,display_name,bio,role'],['projects','id,publication_status,published_at'],['entra_catalog_items','id,kind,name,parent_id,active']]){
 const {error}=await db.from(table).select(columns).limit(1);check(error,'Revisa la estructura de '+table);
}
const initial=await db.rpc('entra_feed_page',{p_before_time:null,p_before_id:null,p_limit:1});check(initial.error,'Ejecuta primero la migración de feed');
const authCheck=await db.auth.admin.listUsers({page:1,perPage:1});check(authCheck.error,'Se necesita una clave administrativa válida');
console.log('Destino comprobado. Se crearán solo cuentas y proyectos ficticios marcados '+DEMO_BATCH+'.');

const catalogQuery=await db.from('entra_catalog_items').select('*');check(catalogQuery.error,'Consultar catálogos');
const catalog=catalogQuery.data??[];
async function option(kind,name,parent=null){
 const existing=catalog.find(i=>i.kind===kind&&i.name.toLocaleLowerCase('es')===name.toLocaleLowerCase('es')&&i.parent_id===parent);
 if(existing){
  if(!existing.active)throw new Error('La opción '+name+' está inactiva. No se reactivó automáticamente.');
  return existing;
 }
 const {data,error}=await db.from('entra_catalog_items').insert({kind,name,parent_id:parent,active:true}).select('*').single();
 check(error,'Crear opción '+name);catalog.push(data);return data;
}
// Validar todas las referencias antes de crear los usuarios.
for(const track of tracks){
 await option('genre',track.genre);
 const instrument=await option('instrument',track.instrument);
 await option('collaboration',track.collaboration,instrument.id);
}
const identities=[];
for(let index=0;index<artists.length;index++){
 const artist=artists[index],email='entra.demo.'+String(index+1).padStart(2,'0')+'@example.com';
 let {data:profile,error}=await db.from('profiles').select('id,username,display_name,bio,role').eq('username',artist.username).maybeSingle();
 check(error,'Consultar artista ficticio');
 let newlyCreated=false;
 if(profile){
  const account=await db.auth.admin.getUserById(profile.id);check(account.error,'Comprobar cuenta ficticia');
  if(account.data.user?.app_metadata?.entra_demo_batch!==DEMO_BATCH)throw new Error('El usuario '+artist.username+' ya existe y no pertenece a esta carga. No se modificó.');
 }else{
  const password=randomBytes(24).toString('base64url')+'Aa1!';
  const result=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:artist.username,display_name:artist.name,entra_demo:true},app_metadata:{entra_demo_batch:DEMO_BATCH}});
  check(result.error,'Crear cuenta '+artist.username);
  if(!result.data.user)throw new Error('No se recibió el ID de la cuenta creada.');
  manifest.users.push({id:result.data.user.id,username:artist.username,email,password,name:artist.name});await persist();
  newlyCreated=true;
  const row=await db.from('profiles').select('id,username,display_name,bio,role').eq('id',result.data.user.id).single();
  check(row.error,'El trigger de Auth debe crear el perfil');profile=row.data;
 }
 if(profile.role==='superadmin')throw new Error('Una cuenta ficticia no debe tener rol administrativo.');
 if(newlyCreated||!profile.bio){
  const update=await db.from('profiles').update({display_name:artist.name,bio:artist.bio}).eq('id',profile.id);check(update.error,'Completar perfil ficticio');
 }
 if(!manifest.users.some(u=>u.id===profile.id)){manifest.users.push({id:profile.id,username:artist.username,email,name:artist.name});await persist();}
 identities.push({id:profile.id,username:profile.username,role:profile.role});
 console.log('Artista '+(index+1)+'/10 listo: '+artist.name);
}
const order=tracks.map((track,index)=>({track,index})).sort((a,b)=>(a.index%2)-(b.index%2)||a.index-b.index);
let created=0,reused=0;
for(const {track,index} of order){
 const user=identities[track.artist],marker='DEMO-FEED-V1-'+String(index+1).padStart(2,'0');
 const existing=await db.from('projects').select('id,description,publication_status').eq('owner_id',user.id).eq('title',track.title);
 check(existing.error,'Consultar publicación ficticia');
 if((existing.data??[]).some(p=>!p.description?.includes(marker)))throw new Error('Existe un proyecto con ese título que no pertenece a la carga. No se modificó.');
 if((existing.data??[]).length>1)throw new Error('Hay proyectos de demostración duplicados; revisa el registro antes de continuar.');
 let projectId=existing.data?.[0]?.id;
 if(!projectId){
  const rendered=await renderDemo(track,index,join(folder,'audio'),argument('--ffmpeg-path')??'ffmpeg');
  const audio=await validateAudio(new File([rendered.bytes],rendered.name,{type:'audio/mpeg'}));
  const genre=await option('genre',track.genre);
  const instrument=await option('instrument',track.instrument);
  const collaboration=await option('collaboration',track.collaboration,instrument.id);
  const start=2+index%4,end=start+6+index%3;
  const fields=new URLSearchParams({title:track.title,genre:genre.name,bpm:String(track.bpm),musicalKey:track.key,need:collaboration.name+' · '+instrument.name,description:track.description+'\n\nInstrumental sintética original de demostración, sin voces ni canciones de terceros. Perfil y proyecto ficticios para probar ENTRA. '+marker,status:'Buscando colaboración',hookStart:String(start),hookEnd:String(end),genreId:String(genre.id),instrumentId:String(instrument.id),collaborationId:String(collaboration.id)});
  const selected=resolveSelection(catalog,fields);
  const input=validateProject(fields,[genre.name]);
  Object.assign(input,{genreId:selected.genre.id,instrumentId:selected.instrument.id,collaborationId:selected.collaboration.id,audio});
  projectId=await model.create(input,user);created++;
 }else reused++;
 if(existing.data?.[0]?.publication_status!=='published'){
  if(!await model.setPublication(Number(projectId),true,user))throw new Error('No se pudo publicar el proyecto ficticio.');
 }
 if(!manifest.projects.some(p=>p.id===Number(projectId))){manifest.projects.push({id:Number(projectId),ownerId:user.id,title:track.title,marker});await persist();}
 console.log('Publicación '+(created+reused)+'/20 lista: '+track.title);
}
const profiles=await db.from('profiles').select('id,username').in('id',identities.map(u=>u.id));check(profiles.error,'Verificar perfiles');
const posts=await db.from('projects').select('id,owner_id,publication_status,audio_name,audio_duration,hook_start,hook_end,description').in('owner_id',identities.map(u=>u.id)).like('description','%DEMO-FEED-V1-%');
check(posts.error,'Verificar publicaciones');
if(profiles.data.length!==10||posts.data.length!==20||posts.data.some(p=>p.publication_status!=='published'||!p.audio_name||!(p.hook_start>=0&&p.hook_end>p.hook_start&&p.hook_end<=p.audio_duration)))throw new Error('La verificación final no coincide con 10 artistas y 20 publicaciones válidas.');
let cursor=null,visible=new Set(),pages=0;
do{
 const {FeedModel}=await import('../src/models/feed.ts');
 const page=await new FeedModel().list(cursor);
 for(const item of page.items)if(posts.data.some(p=>Number(p.id)===item.id))visible.add(item.id);
 cursor=page.nextCursor;pages++;
 if(pages>100)throw new Error('La paginación no terminó dentro del límite de comprobación.');
}while(cursor);
if(visible.size!==20)throw new Error('No todas las publicaciones aparecen en el feed.');
manifest.completedAt=new Date().toISOString();await persist();
console.log(JSON.stringify({ok:true,artists:profiles.data.length,published:posts.data.length,visibleInFeed:visible.size,newProjects:created,reusedProjects:reused,credentialsFile:'.demo-data/credentials.private.json'},null,2));
