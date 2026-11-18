import { layout, escapeHtml as e } from './layout.ts';
import { recordArtwork } from './music-art.ts';
import type { FeedItem, FeedPage } from '../models/feed.ts';
const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg>';
export function feedCard(item: FeedItem, viewerId: string, role: string): string {
  const start = Number(item.hook_start), end = Number(item.hook_end);
  const duration = (end-start).toFixed(1).replace('.0','');
  const canEdit = viewerId === item.owner_id || role === 'superadmin';
  return '<article class="feed-card feed-card--'+item.id%3+'" data-feed-card data-project-id="'+item.id+'" data-start="'+start+'" data-end="'+end+'" aria-label="'+e(item.title)+' de '+e(item.artist_name)+'" tabindex="-1">'
    +'<div class="feed-card__top"><span class="feed-card__genre">'+e(item.genre)+'</span><span class="feed-card__edition">ENTRA / SESSIONS</span></div>'
    +'<div class="feed-card__art" aria-hidden="true"><span class="feed-card__orbit"></span><div class="feed-card__vinyl">'+recordArtwork+'</div><span class="feed-card__stamp">WORK<br>IN<br>PROGRESS</span><div class="feed-card__bars">'+'<i></i>'.repeat(16)+'</div></div>'
    +'<div class="feed-card__body"><p class="feed-card__artist"><span class="feed-card__avatar" aria-hidden="true">'+e(item.artist_name.slice(0,1).toUpperCase())+'</span><span>'+e(item.artist_name)+'<small>@'+e(item.username)+'</small></span></p>'
    +'<h2 class="feed-card__title">'+e(item.title)+'</h2><p class="feed-card__meta">'+item.bpm+' BPM <span>·</span> '+e(item.musical_key)+'</p>'
    +'<div class="feed-card__need"><span>LA PIEZA QUE FALTA</span><p>'+e(item.need)+'</p></div>'
    +'<audio preload="none" controls data-feed-audio aria-label="Demo de '+e(item.title)+'"><source data-src="/feed/'+item.id+'/audio" type="audio/mpeg"></audio>'
    +'<div class="feed-card__player"><button class="feed-card__play" type="button" data-feed-play aria-label="Escuchar hook de '+e(item.title)+'" aria-pressed="false">'+playIcon+'<span data-play-label>Escuchar hook</span></button><div class="feed-card__timeline"><div><span>HOOK · '+duration+' s</span><output data-feed-time>0:00</output></div><progress data-feed-progress value="0" max="'+(end-start)+'" aria-label="Progreso del hook"></progress></div></div>'
    +'<p class="feed-card__message" data-feed-message role="status"></p>'
    +(canEdit ? '<a class="feed-card__edit" href="'+(role==='superadmin' && viewerId!==item.owner_id?'/admin':'')+'/projects/'+item.id+'/edit">Editar publicación ↗</a>' : '')+'</div></article>';
}
export function feedView(page: FeedPage, token: string, viewerId: string, role: string) {
  const cards=page.items.map(item=>feedCard(item,viewerId,role)).join('');
  const next=page.nextCursor
    ? '<section class="feed-end" data-feed-end><p>Hay más ideas por escuchar.</p><a class="button button--primary" data-feed-more href="/feed?cursor='+encodeURIComponent(page.nextCursor)+'">Cargar más</a><p class="muted" data-feed-load-message role="status"></p></section>'
    : '<section class="feed-end" data-feed-end><p>Ya escuchaste las últimas ideas.</p><a class="button" href="/projects/new">Comparte la tuya ↗</a></section>';
  const content='<section class="discover"><aside class="discover__intro"><p class="eyebrow">EL PUNTO DE ENCUENTRO</p><h1>EL SIGUIENTE<br>SONIDO<br>EMPIEZA<br>CONTIGO<span>.</span></h1><p>Una idea. Una pieza que falta.<br>Tu próxima conexión.</p><a href="/projects/new">Publica tu proyecto ↗</a><small>Desliza o usa ↑ ↓ para descubrir.</small></aside>'
    +'<div class="discover__stage"><div class="discover__label"><span>PARA ESCUCHAR</span><span>● ENTRA</span></div><div class="feed-stream" data-feed-stream tabindex="0" aria-label="Feed de proyectos musicales">'
    +(page.items.length ? cards+next : '<section class="feed-empty"><span class="feed-empty__record" aria-hidden="true">'+recordArtwork+'</span><h2>Alguien tiene que<br>darle al play.</h2><p>Publica tu primera demo con un hook.<br>Las ideas del grupo aparecerán aquí.</p><a class="button button--primary" href="/projects">Preparar mi publicación</a></section>')
    +'</div></div><nav class="discover__controls" aria-label="Navegar publicaciones"><button type="button" data-feed-previous aria-label="Publicación anterior">↑</button><button type="button" data-feed-next aria-label="Siguiente publicación">↓</button><span data-feed-counter aria-live="polite"></span></nav></section><script type="module" src="/feed.js"></script>';
  return layout(content,token,'feed',role,'feed-page');
}
