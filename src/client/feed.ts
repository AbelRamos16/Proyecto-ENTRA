{
  const feedStream = document.querySelector<HTMLElement>('[data-feed-stream]');
  if (feedStream) {
    const stream = feedStream;
    const ratios = new Map<HTMLElement, number>();
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
      if (previous) previous.disabled = !all.length || currentIndex===0 && !!active;
      if (next) next.disabled = !all.length;
      const counter = document.querySelector<HTMLElement>('[data-feed-counter]');
      if (counter) counter.textContent = all.length ? String(currentIndex+1).padStart(2,'0')+' / '+String(all.length).padStart(2,'0') : '';
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
      for (const candidate of cards()) candidate.classList.toggle('feed-card--active',candidate===card);
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
    const observer=new IntersectionObserver(entries=>{
      for (const entry of entries) ratios.set(entry.target as HTMLElement,entry.intersectionRatio);
      const best=[...ratios].filter(([card])=>card.isConnected).sort((a,b)=>b[1]-a[1])[0];
      select(best && best[1]>0.55 ? best[0] : null);
    },{root:stream,threshold:[0,0.25,0.55,0.75,1]});
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
        observer.observe(card);
      }
      updateControls();
    }
    function move(direction: number) {
      const all=cards();
      const index=active?all.indexOf(active):currentIndex+(direction<0?1:0);
      const target=all[index+direction];
      const top=target?.offsetTop ?? (direction>0 ? stream.scrollHeight : 0);
      stream.scrollTo({top,behavior:'instant'});
    }
    document.querySelector('[data-feed-previous]')?.addEventListener('click',()=>move(-1));
    document.querySelector('[data-feed-next]')?.addEventListener('click',()=>move(1));
    stream.addEventListener('keydown',event=>{
      if ((event.target as HTMLElement).closest('button,a,input,textarea,select,[contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['ArrowDown','PageDown','ArrowUp','PageUp'].includes(event.key)) {event.preventDefault();move(['ArrowDown','PageDown'].includes(event.key)?1:-1);}
      if (event.key===' ' && active) {event.preventDefault();toggle(active);}
    });
    function suspend() {
      wantPlayback=false; soundEnabled=false; cancelAnimationFrame(frame);
      for (const card of cards()) {audioOf(card).pause();sync(card);}
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
    window.addEventListener('pagehide',suspend);
    const endObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&!loadFailed)void loadMore();},{root:stream,rootMargin:'0px 0px 200px 0px'});
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
        const response=await fetch('/feed/page?cursor='+encodeURIComponent(cursor),{headers:{Accept:'application/json'}});
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
        const page=await response.json() as {html:string;nextCursor:string|null};
        const template=document.createElement('template');template.innerHTML=page.html;
        const existing=new Set(cards().map(c=>c.dataset.projectId));
        for(const node of Array.from(template.content.children)){
          if(!existing.has((node as HTMLElement).dataset.projectId))end.before(node);
        }
        if (page.nextCursor && page.nextCursor!==cursor) {
          link.href='/feed?cursor='+encodeURIComponent(page.nextCursor); status.textContent='';
        } else {
          end.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Ya escuchaste las últimas ideas.'}));
        }
        loadFailed=false;attach();watchEnd();
      } catch {
        loadFailed=true;status.textContent='No se pudo cargar. Pulsa Cargar más para reintentar.';
      } finally {loading=false;}
    }
    stream.addEventListener('click',event=>{
      const link=(event.target as Element).closest('[data-feed-more]');
      if(link){event.preventDefault();loadFailed=false;void loadMore();}
    });
    attach();watchEnd();
  }
}
