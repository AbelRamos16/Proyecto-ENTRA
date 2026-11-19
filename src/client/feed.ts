{
  const feedStream = document.querySelector<HTMLElement>('[data-feed-stream]');
  if (feedStream) {
    const stream = feedStream;
    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const attached = new WeakSet<HTMLElement>();
    let active: HTMLElement | null = null;
    let currentIndex = 0;
    let soundEnabled = false;
    let wantPlayback = false;
    let loading = false;
    let loadFailed = false;
    let frame = 0;
    const cards = () => Array.from(stream.querySelectorAll<HTMLElement>('[data-feed-card]'));
    const audioOf = (card: HTMLElement) => card.querySelector<HTMLAudioElement>('[data-feed-audio]')!;
    const message = (card: HTMLElement, text: string) => { card.querySelector<HTMLElement>('[data-feed-message]')!.textContent = text; };
    const clock = (seconds: number) => Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
    function updateControls() {
      const all = cards();
      const previous = document.querySelector<HTMLButtonElement>('[data-feed-previous]');
      const next = document.querySelector<HTMLButtonElement>('[data-feed-next]');
      if (previous) previous.disabled = !all.length || currentIndex<0;
      if (next) next.disabled = !all.length || currentIndex===all.length-1 && !stream.querySelector('[data-feed-more]');
      const counter = document.querySelector<HTMLElement>('[data-feed-counter]');
      if (counter) counter.textContent = currentIndex<0 ? 'CREAR' : all.length ? String(currentIndex+1).padStart(2,'0')+' / '+String(all.length).padStart(2,'0') : '';
    }
    function sync(card: HTMLElement) {
      const audio = audioOf(card);
      const playing = !audio.paused && card===active && wantPlayback && !document.hidden;
      card.classList.toggle('feed-card--playing',playing);
      card.querySelector<HTMLButtonElement>('[data-feed-play]')!.setAttribute('aria-pressed',String(playing));
      card.querySelector<HTMLElement>('[data-play-label]')!.textContent = playing ? 'Pausar hook' : 'Escuchar hook';
      const elapsed = Math.max(0,Math.min(Number(card.dataset.end)-Number(card.dataset.start),audio.currentTime-Number(card.dataset.start)));
      card.querySelector<HTMLProgressElement>('[data-feed-progress]')!.value = elapsed;
      card.querySelector<HTMLOutputElement>('[data-feed-time]')!.textContent = clock(elapsed);
    }
    function tick() {
      if (!active || !wantPlayback || document.hidden) return;
      const audio=audioOf(active);
      if (!audio.paused) {
        const start=Number(active.dataset.start), end=Number(active.dataset.end);
        if (audio.currentTime>=end-0.025 || audio.currentTime<start-0.05) audio.currentTime=start;
        sync(active);
      }
      frame=requestAnimationFrame(tick);
    }
    function watch() { cancelAnimationFrame(frame); frame=requestAnimationFrame(tick); }
    function start(card: HTMLElement) {
      if (card!==active || !wantPlayback || document.hidden) return;
      const audio=audioOf(card);
      if (audio.readyState<1) { message(card,'Cargando hook…'); audio.load(); return; }
      const first=Number(card.dataset.start), end=Number(card.dataset.end);
      if (audio.duration<end || !Number.isFinite(audio.duration)) { message(card,'Esta demo no tiene un hook disponible.'); wantPlayback=false; return; }
      if (audio.currentTime<first || audio.currentTime>=end) audio.currentTime=first;
      audio.play().then(()=>{
        if (card!==active || !wantPlayback || document.hidden) audio.pause();
        else { message(card,''); sync(card); watch(); }
      }).catch(()=>{
        if (card!==active) return;
        wantPlayback=false;
        message(card,'Toca para activar el sonido.');
        sync(card);
      });
    }
    function select(card: HTMLElement | null) {
      if (card===active) return;
      cancelAnimationFrame(frame);
      for (const candidate of cards()) {
        if (candidate!==card) { audioOf(candidate).pause(); sync(candidate); }
      }
      active=card;
      for (const candidate of cards()) {
        candidate.classList.toggle('feed-card--active',candidate===card);
        candidate.classList.toggle('feed-card--after',cards().indexOf(candidate)>cards().indexOf(card!));
        candidate.inert=!!card && candidate!==card;
      }
      if (card) {
        currentIndex=cards().indexOf(card);
        wantPlayback=soundEnabled;
        if (wantPlayback) start(card);
      }
      updateControls();
    }
    function toggle(card: HTMLElement) {
      const audio=audioOf(card);
      if (card!==active) select(card);
      if (!audio.paused) { wantPlayback=false; soundEnabled=false; audio.pause(); sync(card); }
      else { soundEnabled=true; wantPlayback=true; start(card); }
    }
    function nearest() {
      const middle=stream.scrollLeft+stream.clientWidth/2;
      const create=stream.querySelector<HTMLElement>('[data-feed-create]');
      if(create && Math.abs(create.offsetLeft+create.offsetWidth/2-middle)<create.offsetWidth/2){select(null);currentIndex=-1;updateControls();return;}
      const closest=cards().sort((a,b)=>Math.abs(a.offsetLeft+a.offsetWidth/2-middle)-Math.abs(b.offsetLeft+b.offsetWidth/2-middle))[0];
      select(closest??null);
    }
    let scrollFrame=0;
    stream.addEventListener('scroll',()=>{cancelAnimationFrame(scrollFrame);scrollFrame=requestAnimationFrame(nearest);},{passive:true});
    stream.addEventListener('wheel',event=>{
      if(event.ctrlKey || Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
      const delta=event.deltaY*(event.deltaMode===1?24:event.deltaMode===2?stream.clientWidth:1);
      if(delta<0&&stream.scrollLeft<=1 || delta>0&&stream.scrollLeft>=stream.scrollWidth-stream.clientWidth-1)return;
      event.preventDefault();stream.scrollLeft+=delta;
    },{passive:false});
    window.addEventListener('resize',()=>{
      if(active)stream.scrollTo({left:active.offsetLeft-(stream.clientWidth-active.offsetWidth)/2,behavior:'instant'});
      nearest();
    });
    function attach() {
      for (const card of cards()) {
        if (attached.has(card)) continue;
        attached.add(card);
        const audio=audioOf(card);
        // La vista trae HTML escapado; el audio sigue protegido por sesión.
        const source=audio.querySelector<HTMLSourceElement>('source')!;
        source.src=source.dataset.src!;
        audio.controls=false;
        card.classList.add('feed-card--enhanced');
        card.querySelector('[data-feed-play]')!.addEventListener('click',()=>toggle(card));
        audio.addEventListener('loadedmetadata',()=>start(card));
        audio.addEventListener('play',()=>{
          if (card!==active || !wantPlayback || document.hidden) audio.pause();
          sync(card);
        });
        audio.addEventListener('pause',()=>sync(card));
        audio.addEventListener('timeupdate',()=>sync(card));
        audio.addEventListener('ended',()=>{ if (card===active && wantPlayback) {audio.currentTime=Number(card.dataset.start);start(card);} });
        audio.addEventListener('error',()=>{
          message(card,'La demo no está disponible. Puede haber sido retirada.');
          if (card===active) wantPlayback=false;
          sync(card);
        });

      }
      updateControls();
    }
    function move(direction: number) {
      const all=cards();
      const index=active?all.indexOf(active):currentIndex;
      const target=index+direction<0?stream.querySelector<HTMLElement>('[data-feed-create]'):all[index+direction];
      const left=target?target.offsetLeft-(stream.clientWidth-target.offsetWidth)/2:(direction>0?stream.scrollWidth:0);
      stream.scrollTo({left,behavior:reduceMotion.matches?'instant':'smooth'});
    }
    document.querySelector('[data-feed-previous]')?.addEventListener('click',()=>move(-1));
    document.querySelector('[data-feed-next]')?.addEventListener('click',()=>move(1));
    stream.addEventListener('keydown',event=>{
      if ((event.target as HTMLElement).closest('button,a,input,textarea,select,[contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['ArrowRight','ArrowLeft','ArrowDown','PageDown','ArrowUp','PageUp'].includes(event.key)) {event.preventDefault();move(['ArrowRight','ArrowDown','PageDown'].includes(event.key)?1:-1);}
      if (event.key===' ' && active) {event.preventDefault();toggle(active);}
    });
    function suspend() {
      wantPlayback=false; soundEnabled=false; cancelAnimationFrame(frame);
      for (const card of cards()) {audioOf(card).pause();sync(card);}
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
    window.addEventListener('pagehide',suspend);
    document.addEventListener('proposal-open',suspend);
    const endObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!loadFailed)void loadMore();},{root:stream,rootMargin:'0px 300px 0px 0px'});
    function watchEnd() {
      endObserver.disconnect();
      const end=stream.querySelector('[data-feed-end]');
      if (end?.querySelector('[data-feed-more]')) endObserver.observe(end);
    }
    async function loadMore() {
      const end=stream.querySelector<HTMLElement>('[data-feed-end]');
      const link=end?.querySelector<HTMLAnchorElement>('[data-feed-more]');
      if (!end || !link || loading) return;
      loading=true;
      const status=end.querySelector<HTMLElement>('[data-feed-load-message]')!;
      status.textContent='Cargando más ideas…';
      try {
        const cursor=new URL(link.href).searchParams.get('cursor')!;
        const requestUrl=new URL(link.href);requestUrl.pathname='/feed/page';
        const response=await fetch(requestUrl.pathname+requestUrl.search,{headers:{Accept:'application/json'}});
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
        const page=await response.json() as {html:string;nextCursor:string|null};
        const template=document.createElement('template');template.innerHTML=page.html;
        const existing=new Set(cards().map(c=>c.dataset.projectId));
        for(const node of Array.from(template.content.children)){
          if(!existing.has((node as HTMLElement).dataset.projectId))end.before(node);
        }
        if (page.nextCursor && page.nextCursor!==cursor) {
          const nextUrl=new URL(link.href);nextUrl.searchParams.set('cursor',page.nextCursor);link.href=nextUrl.pathname+nextUrl.search; status.textContent='';
        } else {
          end.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Ya escuchaste las últimas ideas.'}));
        }
        loadFailed=false;attach();nearest();watchEnd();
      } catch {
        loadFailed=true;status.textContent='No se pudo cargar. Pulsa Cargar más para reintentar.';
      } finally {loading=false;}
    }
    stream.addEventListener('click',event=>{
      const link=(event.target as Element).closest('[data-feed-more]');
      if(link){event.preventDefault();loadFailed=false;void loadMore();}
    });
    attach();
    const first=cards()[0];
    if(first)stream.scrollTo({left:first.offsetLeft-(stream.clientWidth-first.offsetWidth)/2,behavior:'instant'});
    nearest();watchEnd();
  }
}
