import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthUser } from '../models/user.ts';
import {CatalogModel} from '../models/catalog.ts';
import {parseDiscoverFilters} from '../models/feed.ts';
import { FeedModel } from '../models/feed.ts';
import { ValidationError } from '../models/project.ts';
import { feedView, feedCard } from '../views/feed.ts';
import { layout } from '../views/layout.ts';
import { html } from './project-controller.ts';
import { sendAudio } from './audio-response.ts';
export async function feedController(req: IncomingMessage, res: ServerResponse, url: URL, model: FeedModel, user: AuthUser, token: string, catalogs?:CatalogModel) {
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); html(res,'Método no permitido',405); return; }
  try {
    if (url.pathname === '/feed' || url.pathname === '/feed/page') {
      const page=await model.list(url.searchParams.get('cursor'),parseDiscoverFilters(url.searchParams));
      if (url.pathname === '/feed/page') {
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({html:page.items.map(item=>feedCard(item,user.id,user.role,token)).join(''),nextCursor:page.nextCursor}));
      } else html(res,feedView(page,token,user.id,user.role,{params:url.searchParams,items:catalogs?await catalogs.list():[]}));
      return;
    }
    const match=url.pathname.match(/^\/feed\/([1-9]\d*)\/audio$/);
    if (match) {
      const bytes=await model.audio(Number(match[1]));
      if (!bytes?.length) { html(res,'La publicación ya no está disponible.',404); return; }
      sendAudio(req,res,bytes); return;
    }
    html(res,'Publicación no encontrada',404);
  } catch(error) {
    if (!(error instanceof ValidationError)) throw error;
    html(res,layout('<h1>No se pudo abrir esta página del feed.</h1><a class="button" href="/feed">Volver al feed</a>',token,'feed',user.role),422);
  }
}
