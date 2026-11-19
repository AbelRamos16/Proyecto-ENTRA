import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.ts';
import {validateProposalAudio,ProposalModel} from '../src/models/proposal.ts';
import type {UserModel} from '../src/models/user.ts';
const artist='11111111-1111-4111-8111-111111111111';
function wav(seconds=1){const size=22050*seconds*2,b=Buffer.alloc(44+size);b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(22050,24);b.writeUInt32LE(44100,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;}
test('Propuestas: formato real, duración y límite de carga se validan en servidor',async()=>{
 const a=await validateProposalAudio(new File([wav()],'voz.wav'));assert.equal(a.mime,'audio/wav');assert.equal(a.duration,1);
 await assert.rejects(()=>validateProposalAudio(new File(['no es audio'],'fake.mp3')));
 await assert.rejects(()=>validateProposalAudio(new File([wav(61)],'larga.wav')));
 await assert.rejects(()=>validateProposalAudio(new File([new Uint8Array(10485761)],'grande.wav')));
});
test('Propuestas: sesión y CSRF, envío multipart, destinatario del servidor, audio privado y decisiones',async()=>{
 let writes=0;
 const users={getSession:async(key:string)=>key==='valid'?{userId:artist,username:'artista',role:'user',csrfToken:'token'}:undefined} as unknown as UserModel;
 const model={create:async(id:number,user:{id:string},message:string,file:File)=>{assert.equal(id,2);assert.equal(user.id,artist);assert.equal(message,'Segunda voz');await validateProposalAudio(file);writes++;return 9;},list:async()=>[],audio:async(id:number)=>id===9?{bytes:new Uint8Array(wav()),mime:'audio/wav'}:undefined,decide:async(id:number)=>id===9} as unknown as ProposalModel;
 const {server}=createApp({userModel:users,proposalModel:model});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const a=server.address();assert.ok(a&&typeof a!=='string');const base='http://127.0.0.1:'+a.port;
 try{
  assert.equal((await fetch(base+'/proposals',{redirect:'manual'})).status,303);
  const form=(csrf:string)=>{const f=new FormData();f.set('csrf',csrf);f.set('message','Segunda voz');f.set('audio',new File([wav()],'voz.wav'));f.set('recipient_id','manipulado');return f;};
  assert.equal((await fetch(base+'/proposals/project/2',{method:'POST',headers:{Cookie:'entra_session=valid'},body:form('incorrecto')})).status,403);assert.equal(writes,0);
  const sent=await fetch(base+'/proposals/project/2',{method:'POST',headers:{Cookie:'entra_session=valid'},body:form('token')});assert.equal(sent.status,201);assert.equal(writes,1);
  const audio=await fetch(base+'/proposals/9/audio',{headers:{Cookie:'entra_session=valid',Range:'bytes=0-43'}});assert.equal(audio.status,206);assert.equal(audio.headers.get('content-type'),'audio/wav');assert.equal((await audio.arrayBuffer()).byteLength,44);
  assert.equal((await fetch(base+'/proposals/8/audio',{headers:{Cookie:'entra_session=valid'}})).status,404);
  const decision=new URLSearchParams({csrf:'token',status:'accepted'});assert.equal((await fetch(base+'/proposals/9/decision',{method:'POST',headers:{Cookie:'entra_session=valid'},body:decision,redirect:'manual'})).status,303);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
