{
 const dialog=document.querySelector<HTMLDialogElement>('[data-collaboration-dialog]');
 if(dialog){
  const reference=dialog.querySelector<HTMLAudioElement>('[data-proposal-reference]')!;
  const preview=dialog.querySelector<HTMLAudioElement>('[data-proposal-preview]')!;
  const record=dialog.querySelector<HTMLButtonElement>('[data-record-start]')!;
  const stop=dialog.querySelector<HTMLButtonElement>('[data-record-stop]')!;
  const clear=dialog.querySelector<HTMLButtonElement>('[data-record-clear]')!;
  const send=dialog.querySelector<HTMLButtonElement>('[data-send-proposal]')!;
  const fileInput=dialog.querySelector<HTMLInputElement>('[data-proposal-file]')!;
  const draft=dialog.querySelector<HTMLTextAreaElement>('[data-collaboration-draft]')!;
  const status=dialog.querySelector<HTMLElement>('[data-proposal-status]')!;
  const timer=dialog.querySelector<HTMLOutputElement>('[data-record-time]')!;
  const close=dialog.querySelector<HTMLButtonElement>('.collaboration-dialog__close')!;
  const proposals=dialog.querySelector<HTMLAnchorElement>('[data-proposals-link]')!;
  let recorder:MediaRecorder|null=null,stream:MediaStream|null=null,recorded:File|null=null;
  let objectUrl='',projectId='',hookStart=0,hookEnd=0,interval=0,started=0,version=0,busy=false,sending=false,requesting=false;
  function controls(){record.disabled=busy||sending||requesting||recorder?.state==='recording';stop.disabled=recorder?.state!=='recording';fileInput.disabled=busy||sending||requesting||recorder?.state==='recording';send.disabled=draft.value.trim().length<5||busy||sending||recorder?.state==='recording';clear.hidden=!recorded;clear.disabled=busy||sending;close.disabled=sending;draft.disabled=sending;}
  function release(){window.clearInterval(interval);stream?.getTracks().forEach(track=>track.stop());stream=null;}
  function discard(){recorded=null;preview.pause();preview.removeAttribute('src');preview.hidden=true;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';fileInput.value='';controls();}
  function cleanup(){version++;if(recorder?.state==='recording')recorder.stop();recorder=null;release();reference.pause();discard();}
  async function prepare(blob:Blob,job:number){
   if(job!==version||!dialog!.open)return;
   busy=true;status.textContent='Preparando tu toma…';controls();let context:AudioContext|null=null;
   try{
    if(!blob.size||blob.size>10*1024*1024)throw new Error('El audio debe pesar hasta 10 MB.');
    context=new AudioContext();const decoded=await context.decodeAudioData(await blob.arrayBuffer());
    if(decoded.duration<.5||decoded.duration>60.1)throw new Error('La toma debe durar entre 0,5 y 60 segundos.');
    const rate=22050,offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*rate),rate),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
    const rendered=await offline.startRendering(),samples=rendered.getChannelData(0),bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);
    const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}
    if(job!==version||!dialog!.open)return;
    discard();recorded=new File([bytes],'propuesta.wav',{type:'audio/wav'});objectUrl=URL.createObjectURL(recorded);preview.src=objectUrl;preview.hidden=false;status.textContent='Toma lista. Escúchala antes de enviar.';
   }catch(error){if(job===version)status.textContent=error instanceof Error?error.message:'No se pudo preparar el audio. Prueba con un MP3.';}
   finally{await context?.close();if(job===version){busy=false;controls();}}
  }
  document.addEventListener('click',event=>{
   const button=(event.target as Element).closest<HTMLButtonElement>('[data-collaborate]');if(!button||button.disabled)return;
   const card=button.closest<HTMLElement>('[data-feed-card]')!;
   cleanup();busy=false;sending=false;requesting=false;projectId=card.dataset.projectId!;hookStart=Number(card.dataset.start);hookEnd=Number(card.dataset.end);
   document.dispatchEvent(new Event('proposal-open'));
   const title=card.querySelector('.feed-card__title')!.textContent!,artist=card.querySelector('[data-artist-name]')!.childNodes[0].textContent!;
   dialog!.querySelector('[data-collaboration-summary]')!.textContent=title+' · '+artist;
   reference.src='/feed/'+projectId+'/audio';timer.value='0:00 / 1:00';draft.value='';status.textContent='';proposals.hidden=true;controls();dialog!.showModal();
  });
  reference.addEventListener('loadedmetadata',()=>{reference.currentTime=hookStart;});
  reference.addEventListener('timeupdate',()=>{if(reference.currentTime>=hookEnd)reference.currentTime=hookStart;});
  reference.addEventListener('play',()=>{if(reference.currentTime<hookStart||reference.currentTime>=hookEnd)reference.currentTime=hookStart;});
  record.addEventListener('click',async()=>{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){status.textContent='Tu navegador no permite grabar aquí. Abre ENTRA en HTTPS o adjunta una toma.';return;}
   const job=++version;requesting=true;controls();status.textContent='Permite el acceso al micrófono para grabar.';
   try{
    const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if(job!==version||!dialog!.open){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;discard();const chunks:Blob[]=[];
    const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    recorder=new MediaRecorder(media,type?{mimeType:type,audioBitsPerSecond:96000}:{audioBitsPerSecond:96000});
    recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});
    recorder.addEventListener('stop',()=>{const mime=recorder?.mimeType??type??'';release();if(job===version){recorder=null;void prepare(new Blob(chunks,{type:mime}),job);}});
    recorder.addEventListener('error',()=>{status.textContent='Se interrumpió la grabación. Puedes volver a grabar.';release();controls();});
    recorder.start(250);started=Date.now();status.textContent='Grabando tu aporte…';
    interval=window.setInterval(()=>{const elapsed=Math.floor((Date.now()-started)/1000);timer.value='0:'+String(elapsed).padStart(2,'0')+' / 1:00';if(elapsed>=60&&recorder?.state==='recording')recorder.stop();},200);
   }catch{if(job===version){status.textContent='No se pudo acceder al micrófono. Revisa el permiso o adjunta tu toma.';release();}}
   finally{if(job===version){requesting=false;controls();}}
  });
  stop.addEventListener('click',()=>{if(recorder?.state==='recording')recorder.stop();});
  clear.addEventListener('click',()=>{version++;discard();status.textContent='Toma descartada. Puedes grabar otra.';});
  fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];if(file)void prepare(file,++version);});
  draft.addEventListener('input',controls);
  send.addEventListener('click',async()=>{
   if(sending)return;
   if(draft.value.trim().length<5){status.textContent='Describe tu aporte en al menos 5 caracteres.';draft.focus();return;}
   sending=true;preview.pause();reference.pause();status.textContent='Enviando tu propuesta…';controls();
   const form=new FormData();form.set('csrf',document.querySelector<HTMLInputElement>('input[name="csrf"]')!.value);form.set('message',draft.value.trim());if(recorded)form.set('audio',recorded);
   try{
    const response=await fetch('/proposals/project/'+projectId,{method:'POST',body:form,headers:{Accept:'application/json'}});
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('La sesión terminó. Recarga la página e inicia sesión.');
    const result=await response.json() as {error?:string;id?:number};if(!response.ok)throw new Error(result.error??'No se pudo enviar.');
    status.textContent='Propuesta enviada. El artista ya puede escucharla en Propuestas.';discard();proposals.hidden=false;draft.value='';
   }catch(error){status.textContent=error instanceof Error?error.message:'No se pudo enviar. Conserva tu toma y reintenta.';}
   finally{sending=false;controls();}
  });
  dialog.addEventListener('cancel',event=>{if(sending)event.preventDefault();});
  dialog.addEventListener('close',()=>{cleanup();busy=false;requesting=false;});
  window.addEventListener('pagehide',cleanup);
 }
}
