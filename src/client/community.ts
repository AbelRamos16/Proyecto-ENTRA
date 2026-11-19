// Reproduce solo el hook seleccionado; una demo por vez en perfiles/biblioteca.
{
 const players=Array.from(document.querySelectorAll<HTMLAudioElement>('[data-preview-hook]'));
 for(const audio of players){
  const start=Number(audio.dataset.start),end=Number(audio.dataset.end);
  audio.addEventListener('loadedmetadata',()=>{audio.currentTime=start;});
  audio.addEventListener('play',()=>{for(const other of players)if(other!==audio)other.pause();if(audio.currentTime<start||audio.currentTime>=end)audio.currentTime=start;});
  audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=end){audio.pause();audio.currentTime=start;}});
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)players.forEach(a=>a.pause());});
}
{
 const link=document.querySelector<HTMLAnchorElement>('.masthead__link[href="/notifications"]');
 if(link){
  const refresh=async()=>{if(document.hidden)return;try{const response=await fetch('/notifications/count',{headers:{Accept:'application/json'}});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return;const {count}=await response.json() as {count:number};if(Number.isSafeInteger(count)&&count>=0){link.textContent=count?'Avisos ('+count+')':'Avisos';link.setAttribute('aria-label',count?count+' notificaciones sin leer':'Notificaciones');}}catch{/* La navegación sigue disponible sin contador. */}};
  void refresh();const timer=window.setInterval(()=>void refresh(),60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});window.addEventListener('pagehide',()=>clearInterval(timer));
 }
}
