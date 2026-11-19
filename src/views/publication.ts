import type { Project } from '../models/project.ts';
import { publicationIssues } from '../models/publication.ts';
import { layout, escapeHtml as e } from './layout.ts';
import { adminLayout } from './admin-shell.ts';

export function publicationPanel(project: Project, token: string, basePath: string) {
  const published=project.publicationStatus==='published';
  if(project.moderationHidden)return '<section class="publication-panel"><div><span class="badge">OCULTA POR MODERACIÓN</span><h2>Esta publicación está en revisión.</h2><p>'+e(project.moderationReason)+'</p><p class="muted">Puedes editar tu proyecto. Solo administración puede restaurar su visibilidad.</p></div>'+(basePath==='/admin/projects'?'<a class="button" href="/admin/reports/project/'+project.id+'">Revisar moderación</a>':'')+'</section>';
  return '<section class="publication-panel" aria-label="Publicación"><div><span class="badge">'+(published?'PUBLICADO':'BORRADOR · SOLO AUTOR Y ADMIN')+'</span><h2>'+(published?'Tu idea ya está sonando.':'Dale al mundo un primer vistazo.')+'</h2><p class="muted">'+(published?'Otros artistas pueden escuchar la demo. La edición sigue protegida.':'Guardar tu proyecto no lo publica. Prepara la demo y elige cuándo compartirla.')+'</p></div>'
    +(published?'<div class="publication-panel__actions"><a class="button button--primary" href="/feed">Abrir Descubrir ↗</a><form method="post" action="'+basePath+'/'+project.id+'/unpublish"><input type="hidden" name="csrf" value="'+e(token)+'"><button class="button" type="submit">Retirar del feed</button></form></div>':'<a class="button button--primary" href="'+basePath+'/'+project.id+'/publish">Preparar publicación ↗</a>')+(basePath==='/admin/projects'?'<a class="button" href="/admin/reports/project/'+project.id+'">Moderar publicación</a>':'')+'</section>';
}
export function publicationView(project: Project, token: string, basePath: string, role: string, error='') {
  const issues=publicationIssues(project);
  const published=project.publicationStatus==='published';
  const content='<a class="back" href="'+basePath+'/'+project.id+'">← Volver al proyecto</a><section class="heading"><div><p class="eyebrow">ANTES DE PUBLICAR</p><h1>Que empiece a sonar.</h1><p class="muted">El hook aparecerá en Descubrir para las cuentas de ENTRA.</p></div></section>'
    +(error?'<p class="notice notice--error" role="alert">'+e(error)+'</p>':'')
    +'<section class="publication-preview"><p class="eyebrow">'+e(project.genre)+' · '+project.bpm+' BPM</p><h2>'+e(project.title)+'</h2><p>'+e(project.need)+'</p>'
    +(project.audioName?'<audio controls preload="metadata" data-hook-audio src="'+basePath+'/'+project.id+'/audio"></audio>':'')
    +(!issues.length?'<p class="muted">Hook: '+project.hookStart+'–'+project.hookEnd+' segundos.</p><button class="button" type="button" data-play-hook data-start="'+project.hookStart+'" data-end="'+project.hookEnd+'">Escuchar el hook</button><p data-audio-message role="status"></p>':'')
    +'</section>'
    +(published?'<p class="notice">Este proyecto ya está publicado.</p>':issues.length?'<section class="publication-checklist"><h2>Falta un último toque</h2><ul>'+issues.map(issue=>'<li>'+e(issue)+'</li>').join('')+'</ul><a class="button button--primary" href="'+basePath+'/'+project.id+'/edit">Completar proyecto</a></section>':'<form class="publication-panel" method="post" action="'+basePath+'/'+project.id+'/publish"><input type="hidden" name="csrf" value="'+e(token)+'"><p>La demo podrá escucharse por otras cuentas de ENTRA. Puedes retirarla cuando quieras.</p><div class="publication-panel__actions"><a class="button" href="'+basePath+'">Conservar borrador</a><button class="button button--primary" type="submit">Publicar en Descubrir</button></div></form>');
  return basePath==='/admin/projects'?adminLayout(content,token,'projects'):layout(content,token,'projects',role);
}
